#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Reuniones de Wispr Flow → 2day (LOGICA §14.7).

  reuniones.py [--desde AAAA-MM-DD] [--id ID]

Lee la base local de Wispr Flow (sólo lectura): las reuniones terminadas que aún no están en
`hoy_reuniones` se resumen con `claude -p` (suscripción) y sus tareas para Alex van a Próximos
(`hoy_proximos.reunion_id`). Sólo las de las últimas 48 h generan próximos.
"""
import datetime as dt
import json
import os
import re
import sqlite3
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
from bitacora import (OWNER, CHULETA, conexion, log, _catalogos, _proyecto, _llamar_claude, _dia_logico)  # noqa: E402

WISPR = os.path.expanduser('~/Library/Application Support/Wispr Flow')
DESDE = '2026-10-19'           # Alex graba todas desde aquí (operator/reuniones/README.md)
CON_PROXIMOS_HORAS = 48
MAX_TRANSCRIPCION = 150_000

INSTRUCCIONES = """Eres el secretario de Alex dentro de 2day, su app de tareas. Te llega una REUNIÓN grabada con Wispr Flow: su transcripción (hablantes numerados; Alex es uno de ellos, normalmente el que dirige) y el resumen automático de Wispr.

Escribe, todo en español y sin humo:
- titulo: corto y claro, con quién y de qué («Daily con Pere: lanzamiento Gemelos»). Nunca «Hablante N»: deduce el nombre por lo que se dice (cómo se llaman entre ellos, de qué cliente hablan); si no se puede, titula sólo por el tema. En el resumen igual: nombres reales cuando se deduzcan, si no «el otro participante».
- resumen: 3-6 viñetas en markdown («- …») con lo importante: qué se habló, números, fechas, cifras.
- decisiones: lo que quedó decidido (quién decide y qué). Lista vacía si no hubo.
- proyecto: el de la reunión, con la CHULETA (alias → proyecto) y PROYECTOS; proyecto_nuevo SÓLO si es un cliente o negocio nuevo de verdad (un curso, lanzamiento o tema de un cliente va a su proyecto).
- tareas: SOLO lo que tiene que hacer ALEX (o su equipo de Claude/CORE por él), concreto y accionable, verbo + objeto. Lo que hacen otros no es tarea suya salvo que Alex tenga que perseguirlo («Pedir a Pere…»). Máximo 8, lo más importante primero. Ninguna que ya esté en TAREAS_DE_ALEX.
  · dia: desde HOY, repartiendo según CARGA (tareas ya planificadas por día): lo urgente (q1) hoy o mañana, lo que tiene fecha dicha en la reunión para esa fecha, sin pasar de ~5 por día.
Responde sólo con el JSON."""


def _limpiar(texto):
    """El resumen de Wispr trae fichas: <@person3:n=Elena> → Elena, <@speaker:1> → Hablante 1."""
    texto = re.sub(r'<@person\d*:n=([^>]+)>', lambda m: urllib.parse.unquote(m.group(1)), texto or '')
    return re.sub(r'<@speaker:(\d+)>', r'Hablante \1', texto)


def _transcripcion(mid):
    for nombre in ('refined.ndjson', 'live.ndjson'):
        ruta = os.path.join(WISPR, 'meetings', mid, nombre)
        if not os.path.exists(ruta):
            continue
        lineas = []
        for linea in open(ruta, errors='replace'):
            try:
                d = json.loads(linea)
            except ValueError:
                continue
            quien = (d.get('speaker') or {}).get('name') or f"Hablante {(d.get('speaker') or {}).get('id', '?')}"
            if d.get('text', '').strip():
                lineas.append(f"[{d.get('timestamp', '')}] {quien}: {d['text'].strip()}")
        if lineas:
            return '\n'.join(lineas)
    return ''


def _wispr():
    c = sqlite3.connect(f"file:{os.path.join(WISPR, 'flow.sqlite')}?mode=ro", uri=True, timeout=10)
    filas = c.execute("""select id, title, createdAt, endedAt, recordedMs, participantNames, summary
                         from Meetings where isDeleted = 0 and finalized = 1 and endedAt is not null
                           and coalesce(isTourDemo, 0) = 0 order by createdAt""").fetchall()
    c.close()
    return filas


def _esquema(categorias):
    clasif = {
        'proyecto_id': {'type': ['string', 'null']},
        'proyecto_nuevo': {'type': ['string', 'null']},
    }
    tarea = {'type': 'object', 'properties': {
        'titulo': {'type': 'string'}, 'descripcion': {'type': 'string'}, **clasif,
        'categoria': {'type': 'string', 'enum': categorias},
        'cuadrante': {'type': 'string', 'enum': ['q1', 'q2', 'q3', 'q4']},
        'dia': {'type': 'string', 'description': 'AAAA-MM-DD'}, 'minutos': {'type': 'integer'},
    }, 'required': ['titulo', 'descripcion', 'proyecto_id', 'proyecto_nuevo', 'categoria', 'cuadrante', 'dia', 'minutos']}
    return {'type': 'object', 'properties': {
        'titulo': {'type': 'string'}, 'resumen': {'type': 'string'},
        'decisiones': {'type': 'array', 'items': {'type': 'string'}},
        **clasif,
        'tareas': {'type': 'array', 'maxItems': 8, 'items': tarea},
    }, 'required': ['titulo', 'resumen', 'decisiones', 'proyecto_id', 'proyecto_nuevo', 'tareas']}


def procesar(desde=DESDE, solo=None):
    # Una sola pasada a la vez (LaunchAgent y a mano): dos a la vez duplicarían los próximos.
    import fcntl
    from bitacora import CASA
    os.makedirs(CASA, exist_ok=True)
    candado = open(os.path.join(CASA, 'reuniones.lock'), 'w')
    try:
        fcntl.flock(candado, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return 0
    c = conexion()
    cur = c.cursor()
    cur.execute("select id from hoy_reuniones where owner_id = %s and procesada_en is not null", (OWNER,))
    hechas = {r[0] for r in cur.fetchall()}
    n = 0
    for mid, titulo, creada, fin_ms, ms, participantes, resumen_w in _wispr():
        if (solo and mid != solo) or (not solo and (mid in hechas or creada[:10] < desde)):
            continue
        transcripcion = _transcripcion(mid)
        if not transcripcion and not resumen_w:
            continue  # aún sin nada que leer: la siguiente vuelta
        inicio = dt.datetime.fromisoformat(creada.replace(' +00:00', '+00:00'))
        fin = dt.datetime.fromtimestamp(fin_ms / 1000, dt.timezone.utc)
        con_proximos = fin > dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=CON_PROXIMOS_HORAS)
        try:
            n += _una(c, cur, mid, titulo, inicio, fin, ms, participantes, _limpiar(resumen_w), transcripcion, con_proximos)
        except Exception as e:
            c.rollback()
            log('reunion ERROR', mid[:8], repr(e)[:300])
            print('ERROR', mid[:8], e, file=sys.stderr)
    c.close()
    return n


def _una(c, cur, mid, titulo_w, inicio, fin, ms, participantes, resumen_w, transcripcion, con_proximos):
    proyectos, categorias = _catalogos(cur)
    hoy = _dia_logico(dt.datetime.now().astimezone())
    cur.execute("""select k.hoy_para, count(*) from hoy_capa k join hoy_tareas t on t.id = k.tarea_id
                   where k.owner_id = %s and not t.hecha and t.archivado_at is null and k.hoy_para between %s and %s group by 1""",
                (OWNER, hoy, hoy + dt.timedelta(days=10)))
    carga = {str(d): k for d, k in cur.fetchall()}
    cur.execute("""select titulo from hoy_tareas where owner_id = %s and not hecha and archivado_at is null
                   order by updated_at desc limit 150""", (OWNER,))
    abiertas = [r[0] for r in cur.fetchall()]
    salida = _llamar_claude({
        'REUNION': {'titulo_wispr': titulo_w, 'inicio': inicio.astimezone().strftime('%d-%m-%Y %H:%M'),
                    'minutos': round((ms or 0) / 60000), 'participantes': participantes or ''},
        'RESUMEN_WISPR': resumen_w,
        'TRANSCRIPCION': transcripcion[:MAX_TRANSCRIPCION],
        'PROYECTOS': proyectos, 'CATEGORIAS': categorias,
        'CHULETA': open(CHULETA).read() if os.path.exists(CHULETA) else '',
        'TAREAS_DE_ALEX': abiertas,
        'HOY': str(hoy),
        'CARGA': {str(hoy + dt.timedelta(days=i)): carga.get(str(hoy + dt.timedelta(days=i)), 0) for i in range(11)},
    }, _esquema(list(categorias)), INSTRUCCIONES)

    proyecto = _proyecto(cur, salida, proyectos)
    cur.execute("""insert into hoy_reuniones (id, owner_id, titulo, titulo_wispr, inicio, fin, minutos, participantes, resumen,
                     decisiones, proyecto_id, resumen_wispr, transcripcion, procesada_en)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                   on conflict (id) do update set titulo = excluded.titulo, resumen = excluded.resumen, decisiones = excluded.decisiones,
                     proyecto_id = excluded.proyecto_id, resumen_wispr = excluded.resumen_wispr, transcripcion = excluded.transcripcion,
                     procesada_en = now(), updated_at = now()""",
                (mid, OWNER, salida['titulo'][:200], titulo_w or '', inicio, fin, round((ms or 0) / 60000), participantes or '',
                 salida['resumen'], json.dumps(salida.get('decisiones', [])), proyecto, resumen_w, transcripcion))
    n = 0
    if con_proximos:
        cur.execute("delete from hoy_proximos where reunion_id = %s and estado = 'propuesto'", (mid,))
        for orden, t in enumerate(salida.get('tareas', [])[:8]):
            try:
                dia = max(dt.date.fromisoformat(t.get('dia') or ''), hoy)
            except ValueError:
                dia = hoy
            cur.execute("""insert into hoy_proximos (owner_id, reunion_id, titulo, descripcion, proyecto_id, categoria, cuadrante, dia, minutos, orden)
                           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                        (OWNER, mid, t['titulo'][:200], t.get('descripcion', ''), _proyecto(cur, t, proyectos) or proyecto,
                         t.get('categoria') if t.get('categoria') in categorias else None,
                         t.get('cuadrante') if t.get('cuadrante') in ('q1', 'q2', 'q3', 'q4') else None, dia, t.get('minutos'), orden))
            n += 1
    c.commit()
    log('reunion', mid[:8], salida['titulo'][:60], f'{n} próximos')
    return 1


if __name__ == '__main__':
    a = sys.argv[1:]
    desde = a[a.index('--desde') + 1] if '--desde' in a else DESDE
    solo = a[a.index('--id') + 1] if '--id' in a else None
    print(f'{procesar(desde, solo)} reuniones')

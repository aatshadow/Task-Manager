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
from bitacora import (OWNER, CHULETA, conexion, log, _catalogos, _proyecto, _llamar_claude, _dia_logico, partir)  # noqa: E402

WISPR = os.path.expanduser('~/Library/Application Support/Wispr Flow')
DESDE = '2026-10-19'           # Alex graba todas desde aquí (operator/reuniones/README.md)
CON_PROXIMOS_HORAS = 48
MAX_TRANSCRIPCION = 150_000

INSTRUCCIONES = """Eres el secretario de Alex dentro de 2day, su app de tareas. Te llega una REUNIÓN grabada con Wispr Flow: su transcripción (hablantes numerados; Alex es uno de ellos, normalmente el que dirige) y el resumen automático de Wispr.

Escribe, todo en español y sin humo:
- titulo: corto y claro, con quién y de qué («Daily con Pere: lanzamiento Gemelos»). Nunca «Hablante N»: deduce el nombre por lo que se dice (cómo se llaman entre ellos, de qué cliente hablan); si no se puede, titula sólo por el tema. En el resumen igual: nombres reales cuando se deduzcan, si no «el otro participante».
- resumen: 3-6 viñetas en markdown («- …») con lo importante: qué se habló, números, fechas, cifras.
- decisiones: lo que quedó decidido (quién decide y qué). Lista vacía si no hubo.
- proyecto: el de la reunión (y el de cada tarea), con la CHULETA (alias → proyecto) y PROYECTOS; si es de un CLIENTE de GrowthInfo («cliente:…»: Elena, Jonathan, Gemelos…), ese cliente, no «GrowthInfo»; proyecto_nuevo SÓLO si es un cliente o negocio nuevo de verdad (un curso, lanzamiento o tema de un cliente va a su proyecto).
- tareas: SOLO lo que tiene que hacer ALEX (o su equipo de Claude/CORE por él), concreto y accionable, verbo + objeto. Lo que hacen otros no es tarea suya salvo que Alex tenga que perseguirlo («Pedir a Pere…»). Máximo 8, lo más importante primero. Ninguna que ya esté en TAREAS_DE_ALEX.
  · dia: desde HOY, repartiendo según CARGA (tareas ya planificadas por día): lo urgente (q1) hoy o mañana, lo que tiene fecha dicha en la reunión para esa fecha, sin pasar de ~5 por día.
Responde sólo con el JSON."""


def _limpiar(texto):
    """El resumen de Wispr trae fichas: <@person3:n=Elena> → Elena, <@speaker:1> → Hablante 1."""
    texto = re.sub(r'<@person\d*:n=([^>]+)>', lambda m: urllib.parse.unquote(m.group(1)), texto or '')
    return re.sub(r'<@speaker:(\d+)>', r'Hablante \1', texto)


ALEX = ('f8f46b1e-f257-4aaa-b535-3e5ba3022332', 'alex gutiérrez')   # contacto de Alex en Wispr
MULETILLAS = ['vale', 'o sea', 'sabes', 'bueno', 'tío', 'en plan', '¿no?', 'eh', 'vamos', 'básicamente',
              'literalmente', 'realmente', 'pues', 'claro', 'digamos', 'la verdad', 'tipo']


def _hablantes(asignaciones):
    """speakerAssignments de Wispr → {id: {nombre, alex}}. Manda lo que puso Alex a mano, luego el micro,
    luego la plataforma (Meet) y por último la IA de Wispr."""
    try:
        datos = json.loads(asignaciones or '{}')
    except ValueError:
        return {}
    out = {}
    for sid, fuentes in datos.items():
        for clave in ('user', 'mic', 'dom', 'llm'):
            f = (fuentes or {}).get(clave)
            if f and f.get('name'):
                es_alex = f.get('contactId') == ALEX[0] or f['name'].strip().lower() == ALEX[1]
                out[str(sid)] = {'nombre': f['name'], 'alex': es_alex}
                break
    return out


def _completar_alex(mid, hablantes, segs):
    """Si Wispr no sabe qué voz es Alex (reuniones viejas), que lo deduzca la IA por el contexto."""
    if any(v['alex'] for v in hablantes.values()) or not segs:
        return hablantes
    muestra = '\n'.join(f'[{h}] {x}' for _, h, x in segs[:220])[:14000]
    ids = sorted({h for _, h, _ in segs})
    schema = {'type': 'object', 'properties': {'alex': {'type': 'array', 'items': {'type': 'string', 'enum': ids}}}, 'required': ['alex']}
    try:
        r = _llamar_claude({'ENCARGO': 'Di qué ids de hablante son Alex Gutiérrez (CEO de CORE/GrowthInfo: monta sistemas, portales, '
                                       'automatizaciones, habla de Claude, del portal y de los clientes). Puede ser más de uno '
                                       '(la diarización a veces lo parte). Si no está claro, lista vacía.',
                            'TRANSCRIPCION': muestra}, schema, 'Responde sólo con el JSON.')
    except Exception as e:
        log('reunion alex ERROR', mid[:8], repr(e)[:200])
        return hablantes
    out = dict(hablantes)
    for h in r.get('alex', []):
        out[h] = {'nombre': 'Alex Gutiérrez', 'alex': True, 'deducido': True}
    return out


def _segundos(marca):
    try:
        partes = [int(x) for x in str(marca).split(':')]
    except ValueError:
        return None
    seg = 0
    for p in partes:
        seg = seg * 60 + p
    return seg


def _segmentos(mid):
    """[(segundo, id_hablante, texto)] de la transcripción refinada (o la viva)."""
    for nombre in ('refined.ndjson', 'live.ndjson'):
        ruta = os.path.join(WISPR, 'meetings', mid, nombre)
        if not os.path.exists(ruta):
            continue
        segs = []
        for linea in open(ruta, errors='replace'):
            try:
                d = json.loads(linea)
            except ValueError:
                continue
            if d.get('text', '').strip():
                segs.append((_segundos(d.get('timestamp')), str((d.get('speaker') or {}).get('id', '?')), d['text'].strip()))
        if segs:
            return segs
    return []


def metricas(segs, hablantes):
    """§15: cómo habla Alex en una reunión, medido sin IA."""
    alex_ids = {k for k, v in hablantes.items() if v['alex']}
    if not segs or not alex_ids:
        return None
    dur = []
    for i, (t, _, _) in enumerate(segs):
        sig = segs[i + 1][0] if i + 1 < len(segs) else None
        dur.append(min(45, max(1, sig - t)) if t is not None and sig is not None and sig >= t else 5)
    palabras = lambda x: len(re.findall(r"\w+", x))
    total_p = sum(palabras(x) for _, _, x in segs) or 1
    alex = [(t, x, d) for (t, h, x), d in zip(segs, dur) if h in alex_ids]
    alex_p = sum(palabras(x) for _, x, _ in alex)
    alex_s = sum(d for _, _, d in alex)
    total_s = sum(dur) or 1
    # turnos = rachas seguidas de Alex; monólogo = turno de más de 90 s
    turnos, actual = [], None
    for (t, h, x), d in zip(segs, dur):
        if h in alex_ids:
            actual = (actual or 0) + d
        elif actual is not None:
            turnos.append(actual); actual = None
    if actual is not None:
        turnos.append(actual)
    texto = ' '.join(x for _, x, _ in alex).lower()
    muletillas = {}
    for m in MULETILLAS:
        patron = re.escape(m) if not m[0].isalpha() else r'(?<!\w)' + re.escape(m) + r'(?!\w)'
        n = len(re.findall(patron, texto))
        if n:
            muletillas[m] = round(n * 1000 / max(alex_p, 1), 1)
    otros = sorted({v['nombre'] for k, v in hablantes.items() if not v['alex']})
    return {
        'minutos': round(total_s / 60), 'hablantes': len({h for _, h, _ in segs}), 'con': otros,
        'cuota_palabras': round(100 * alex_p / total_p), 'cuota_tiempo': round(100 * alex_s / total_s),
        'palabras': alex_p, 'ppm': round(alex_p / (alex_s / 60)) if alex_s > 30 else None,
        'intervenciones': len(alex), 'turnos': len(turnos),
        'turno_medio_s': round(sum(turnos) / len(turnos)) if turnos else 0,
        'monologos': sum(1 for x in turnos if x > 90), 'turno_max_s': round(max(turnos)) if turnos else 0,
        'preguntas': sum(1 for _, x, _ in alex if '?' in x),
        'pct_preguntas': round(100 * sum(1 for _, x, _ in alex if '?' in x) / max(len(alex), 1)),
        'muletillas_por_mil': dict(sorted(muletillas.items(), key=lambda kv: -kv[1])),
    }


def _transcripcion(mid, hablantes=None):
    hablantes = hablantes or {}
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
            sid = str((d.get('speaker') or {}).get('id', '?'))
            quien = (d.get('speaker') or {}).get('name') or (hablantes.get(sid) or {}).get('nombre') or f"Hablante {sid}"
            if d.get('text', '').strip():
                lineas.append(f"[{d.get('timestamp', '')}] {quien}: {d['text'].strip()}")
        if lineas:
            return '\n'.join(lineas)
    return ''


def _wispr():
    c = sqlite3.connect(f"file:{os.path.join(WISPR, 'flow.sqlite')}?mode=ro", uri=True, timeout=10)
    filas = c.execute("""select id, title, createdAt, endedAt, recordedMs, participantNames, summary, speakerAssignments
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
    for mid, titulo, creada, fin_ms, ms, participantes, resumen_w, asignaciones in _wispr():
        if (solo and mid != solo) or (not solo and (mid in hechas or creada[:10] < desde)):
            continue
        hablantes = _hablantes(asignaciones)
        transcripcion = _transcripcion(mid, hablantes)
        if not transcripcion and not resumen_w:
            continue  # aún sin nada que leer: la siguiente vuelta
        inicio = dt.datetime.fromisoformat(creada.replace(' +00:00', '+00:00'))
        fin = dt.datetime.fromtimestamp(fin_ms / 1000, dt.timezone.utc)
        con_proximos = fin > dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=CON_PROXIMOS_HORAS)
        try:
            n += _una(c, cur, mid, titulo, inicio, fin, ms, participantes, _limpiar(resumen_w), transcripcion, con_proximos)
            segs = _segmentos(mid)
            hablantes = _completar_alex(mid, hablantes, segs)
            cur.execute("update hoy_reuniones set hablantes = %s, metricas = %s where id = %s",
                        (json.dumps(hablantes), json.dumps(metricas(segs, hablantes)), mid))
            c.commit()
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
    pid, cid = partir(proyecto)
    cur.execute("""insert into hoy_reuniones (id, owner_id, titulo, titulo_wispr, inicio, fin, minutos, participantes, resumen,
                     decisiones, proyecto_id, client_id, resumen_wispr, transcripcion, procesada_en)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                   on conflict (id) do update set titulo = excluded.titulo, resumen = excluded.resumen, decisiones = excluded.decisiones,
                     proyecto_id = excluded.proyecto_id, client_id = excluded.client_id, resumen_wispr = excluded.resumen_wispr, transcripcion = excluded.transcripcion,
                     procesada_en = now(), updated_at = now()""",
                (mid, OWNER, salida['titulo'][:200], titulo_w or '', inicio, fin, round((ms or 0) / 60000), participantes or '',
                 salida['resumen'], json.dumps(salida.get('decisiones', [])), pid, cid, resumen_w, transcripcion))
    n = 0
    if con_proximos:
        cur.execute("delete from hoy_proximos where reunion_id = %s and estado = 'propuesto'", (mid,))
        for orden, t in enumerate(salida.get('tareas', [])[:8]):
            try:
                dia = max(dt.date.fromisoformat(t.get('dia') or ''), hoy)
            except ValueError:
                dia = hoy
            cur.execute("""insert into hoy_proximos (owner_id, reunion_id, titulo, descripcion, proyecto_id, client_id, categoria, cuadrante, dia, minutos, orden)
                           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                        (OWNER, mid, t['titulo'][:200], t.get('descripcion', ''), *partir(_proyecto(cur, t, proyectos) or proyecto),
                         t.get('categoria') if t.get('categoria') in categorias else None,
                         t.get('cuadrante') if t.get('cuadrante') in ('q1', 'q2', 'q3', 'q4') else None, dia, t.get('minutos'), orden))
            n += 1
    c.commit()
    log('reunion', mid[:8], salida['titulo'][:60], f'{n} próximos')
    return 1


def recalcular_metricas():
    """Rellena hablantes y métricas de todas las reuniones ya registradas (sin IA)."""
    c = conexion()
    cur = c.cursor()
    cur.execute("select id from hoy_reuniones where owner_id = %s", (OWNER,))
    ids = {r[0] for r in cur.fetchall()}
    n = 0
    for mid, *_, asignaciones in _wispr():
        if mid in ids:
            segs = _segmentos(mid)
            h = _completar_alex(mid, _hablantes(asignaciones), segs)
            cur.execute("update hoy_reuniones set hablantes = %s, metricas = %s where id = %s",
                        (json.dumps(h), json.dumps(metricas(segs, h)), mid))
            n += 1
    c.commit()
    c.close()
    return n


if __name__ == '__main__':
    a = sys.argv[1:]
    if '--metricas' in a:
        print(f'{recalcular_metricas()} reuniones con métricas')
        sys.exit(0)
    desde = a[a.index('--desde') + 1] if '--desde' in a else DESDE
    solo = a[a.index('--id') + 1] if '--id' in a else None
    print(f'{procesar(desde, solo)} reuniones')

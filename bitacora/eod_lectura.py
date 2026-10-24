#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
La lectura IA del EOD (LOGICA §16.3): qué ha pasado hoy, de dónde venimos y a dónde vamos.

  eod_lectura.py [AAAA-MM-DD]   la escribe ya para ese día lógico (por defecto, el de hoy)
  eod_lectura.py --si-toca      sólo los días que la app pidió (`hoy_eod.lectura_estado = 'pedido'`)

Junta el día entero (EOD, hábitos, tareas completadas y creadas, reuniones, sesiones de Claude) y los
14 días anteriores, los hitos y el reto; escribe con `claude -p` (suscripción) y lo guarda en `hoy_eod.lectura`.
"""
import datetime as dt
import fcntl
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
from bitacora import OWNER, CASA, conexion, log, _llamar_claude  # noqa: E402

MODELO = os.environ.get('EOD_MODELO', 'opus')
DIAS_ATRAS = 14

ESQUEMA = {'type': 'object', 'properties': {
    'titular': {'type': 'string', 'description': 'Una frase que resume el día, con un número.'},
    'nota': {'type': 'number', 'description': 'El día de 0 a 10 (admite medios).'},
    'hoy': {'type': 'string', 'description': 'Qué ha pasado hoy: 3-5 frases con datos.'},
    'de_donde_venimos': {'type': 'string', 'description': 'Los últimos días: tendencia de hechas, hábitos, sueño, peso; cómo encaja hoy.'},
    'a_donde_vamos': {'type': 'string', 'description': 'Hitos que vienen, el reto, la misión; qué significa para mañana.'},
    'senales': {'type': 'array', 'items': {'type': 'object', 'properties': {
        'tono': {'type': 'string', 'enum': ['bien', 'ojo']}, 'texto': {'type': 'string'}},
        'required': ['tono', 'texto']}, 'description': '2-5 señales concretas, buenas o de alerta.'},
    'foco_manana': {'type': 'string', 'description': 'Lo único que tiene que pasar mañana, accionable.'},
}, 'required': ['titular', 'nota', 'hoy', 'de_donde_venimos', 'a_donde_vamos', 'senales', 'foco_manana']}

INSTRUCCIONES = """Eres el jefe de gabinete de Alex dentro de 2day, su app de tareas y hábitos. Alex es CEO de una consultoría de sistemas para negocios online. Su misión: 520.424,26 € a 16-09-2027. Está en un reto de 90 días (RETO) con un protocolo diario de hábitos.

Te llega su DIA (el EOD que ha rellenado, sueño, peso, hábitos hechos y no, tareas completadas y creadas, reuniones, el trabajo de Claude Code), los DIAS_ANTERIORES (números y sus EOD), los HITOS que vienen y lo PLANIFICADO para mañana. Escribe la lectura de cierre del día:
- Español, directo, tuteándole, sin humo ni frases motivacionales. Cada afirmación con su dato.
- «hoy»: lo que de verdad ha avanzado y lo que no; distingue trabajo de Claude de lo que hizo él.
- «de_donde_venimos»: compara con los días anteriores (hechas, adherencia, sueño, peso, lo que repite en sus respuestas).
- «a_donde_vamos»: hitos cercanos con días que faltan, el día del reto, y qué pide eso mañana.
- Si faltan datos (no rellenó algo), dilo una vez, sin sermón.
- Usa sus propias respuestas del EOD; si dice qué es lo único de mañana, respétalo en foco_manana o di por qué cambiarlo.
Responde sólo con el JSON."""


def _limites(cur, fecha):
    cur.execute('select hora_reinicio from hoy_ajustes where owner_id = %s', (OWNER,))
    f = cur.fetchone()
    h = f[0] if f and f[0] else dt.time(4, 0)
    tz = dt.datetime.now().astimezone().tzinfo
    desde = dt.datetime.combine(fecha, h, tz)
    return desde, desde + dt.timedelta(days=1)


def dia_logico(ahora=None):
    ahora = ahora or dt.datetime.now()
    return (ahora - dt.timedelta(hours=4)).date()


def _habitos(cur, fecha):
    cur.execute("""select h.id, h.nombre, h.tipo, h.unidad, h.cadencia, h.dias, h.grupo, m.valor, m.nota, m.habito_id is not null
                   from hoy_habitos h left join hoy_marcas m on m.habito_id = h.id and m.fecha = %s
                   where h.owner_id = %s and (h.archivado_at is null or h.archivado_at::date > %s) and h.created_at::date <= %s
                   order by h.hora nulls last""", (fecha, OWNER, fecha, fecha))
    hechos, pendientes, medidas = [], [], {}
    for _, nombre, tipo, unidad, cadencia, dias, grupo, valor, nota, marcado in cur.fetchall():
        hecho = marcado and (tipo != 'medir' or valor is not None)
        toca = hecho if cadencia == 'semana' else (fecha.isoweekday() in (dias or []) if cadencia == 'dias' else True)
        if tipo == 'medir' and valor is not None:
            medidas[nombre] = f'{float(valor):g} {unidad}'.strip()
        if not toca:
            continue
        (hechos if hecho else pendientes).append(nombre + (f' ({nota})' if nota else ''))
    return {'hechos': hechos, 'pendientes': pendientes, 'medidas': medidas,
            'adherencia': f'{len(hechos)}/{len(hechos) + len(pendientes)}'}


def _dia(cur, fecha):
    desde, hasta = _limites(cur, fecha)
    cur.execute('select respuestas from hoy_eod where owner_id = %s and fecha = %s', (OWNER, fecha))
    f = cur.fetchone()
    cur.execute("""select t.titulo, coalesce(p.nombre, '') from hoy_tareas t left join hoy_proyectos p on p.id = t.proyecto_id
                   where t.owner_id = %s and t.hecha and t.hecha_en >= %s and t.hecha_en < %s order by t.hecha_en""", (OWNER, desde, hasta))
    completadas = [f'{t} [{p}]' if p else t for t, p in cur.fetchall()]
    cur.execute("""select t.titulo, coalesce(p.nombre, ''), t.hecha from hoy_tareas t left join hoy_proyectos p on p.id = t.proyecto_id
                   where t.owner_id = %s and t.archivado_at is null and t.created_at >= %s and t.created_at < %s order by t.created_at""", (OWNER, desde, hasta))
    creadas = [(f'{t} [{p}]' if p else t) + (' (ya hecha)' if h else '') for t, p, h in cur.fetchall()]
    cur.execute("""select coalesce(titulo, titulo_wispr), minutos, resumen, decisiones from hoy_reuniones
                   where owner_id = %s and inicio >= %s and inicio < %s order by inicio""", (OWNER, desde, hasta))
    reuniones = [{'titulo': t, 'minutos': m, 'resumen': r, 'decisiones': d} for t, m, r, d in cur.fetchall()]
    cur.execute("""select s.titulo, s.resumen, count(p.*), round(sum(extract(epoch from (p.fin - p.inicio))) / 60)
                   from hoy_cc_pasos p join hoy_cc_sesiones s on s.id = p.sesion_id
                   where s.owner_id = %s and p.inicio >= %s and p.inicio < %s group by s.id, s.titulo, s.resumen""", (OWNER, desde, hasta))
    claude = [{'sesion': t, 'resumen': r, 'pasos': n, 'minutos': int(m or 0)} for t, r, n, m in cur.fetchall()]
    return {'fecha': str(fecha), 'eod': f[0] if f else {}, 'habitos': _habitos(cur, fecha),
            'completadas': completadas[:80], 'creadas': creadas[:80], 'n_completadas': len(completadas), 'n_creadas': len(creadas), 'reuniones': reuniones, 'claude': claude}


def generar(fecha):
    c = conexion()
    cur = c.cursor()
    dia = _dia(cur, fecha)
    anteriores = []
    for i in range(DIAS_ATRAS, 0, -1):
        f = fecha - dt.timedelta(days=i)
        desde, hasta = _limites(cur, f)
        cur.execute('select count(*) from hoy_tareas where owner_id = %s and hecha and hecha_en >= %s and hecha_en < %s', (OWNER, desde, hasta))
        hechas = cur.fetchone()[0]
        cur.execute("select respuestas, lectura->>'titular' from hoy_eod where owner_id = %s and fecha = %s", (OWNER, f))
        e = cur.fetchone()
        h = _habitos(cur, f)
        anteriores.append({'fecha': str(f), 'hechas': hechas, 'habitos': h['adherencia'], 'medidas': h['medidas'],
                           'eod': e[0] if e else None, 'titular_lectura': e[1] if e else None})
    cur.execute("""select nombre, frente, fecha, hecho from hoy_hitos where owner_id = %s and fecha >= %s and fecha <= %s
                   order by fecha""", (OWNER, fecha, fecha + dt.timedelta(days=60)))
    hitos = [{'hito': n, 'frente': fr, 'fecha': str(fe), 'faltan_dias': (fe - fecha).days, 'hecho': h} for n, fr, fe, h in cur.fetchall()]
    cur.execute('select nombre, inicio, fin from hoy_retos where owner_id = %s and activo and inicio <= %s and fin >= %s', (OWNER, fecha, fecha))
    r = cur.fetchone()
    reto = {'nombre': r[0], 'dia': (fecha - r[1]).days + 1, 'total': (r[2] - r[1]).days + 1} if r else None
    manana = fecha + dt.timedelta(days=1)
    cur.execute("""select t.titulo from hoy_tareas t join hoy_capa c on c.tarea_id = t.id
                   where t.owner_id = %s and not t.hecha and t.archivado_at is null and c.hoy_para <= %s order by c.orden""", (OWNER, manana))
    planificado = [x[0] for x in cur.fetchall()]

    entrada = {'DIA': dia, 'DIAS_ANTERIORES': anteriores, 'HITOS': hitos, 'RETO': reto, 'PLANIFICADO_MANANA': planificado}
    cur.execute("""insert into hoy_eod (owner_id, fecha, lectura_estado) values (%s, %s, 'pedido')
                   on conflict (owner_id, fecha) do nothing""", (OWNER, fecha))
    c.commit()
    lectura = _llamar_claude(entrada, ESQUEMA, INSTRUCCIONES, modelo=MODELO)
    cur.execute("""update hoy_eod set lectura = %s, lectura_estado = 'listo', lectura_en = now(), lectura_error = null
                   where owner_id = %s and fecha = %s""", (json.dumps(lectura, ensure_ascii=False), OWNER, fecha))
    c.commit()
    c.close()
    log('eod lectura', fecha, lectura.get('titular'))
    return lectura


def pedidos():
    c = conexion()
    with c, c.cursor() as cur:
        cur.execute("select fecha from hoy_eod where owner_id = %s and lectura_estado = 'pedido' order by fecha", (OWNER,))
        out = [f for (f,) in cur.fetchall()]
    c.close()
    return out


if __name__ == '__main__':
    os.makedirs(CASA, exist_ok=True)
    candado = open(os.path.join(CASA, 'eod.lock'), 'w')
    try:
        fcntl.flock(candado, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        sys.exit(0)
    if '--si-toca' in sys.argv:
        for fecha in pedidos():
            try:
                generar(fecha)
            except Exception as e:
                log('eod lectura ERROR', fecha, repr(e)[:300])
                c = conexion()
                with c, c.cursor() as cur:
                    cur.execute("update hoy_eod set lectura_estado = 'error', lectura_error = %s where owner_id = %s and fecha = %s",
                                (str(e)[:500], OWNER, fecha))
    else:
        arg = next((a for a in sys.argv[1:] if not a.startswith('-')), None)
        print(json.dumps(generar(dt.date.fromisoformat(arg) if arg else dia_logico()), ensure_ascii=False, indent=2))

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
La ficha IA de Alex en reuniones (LOGICA §15): cómo habla, su estilo, lo que hace bien y lo que no.

  perfil_meetings.py            genera una versión nueva ya
  perfil_meetings.py --si-toca  sólo si la app la pidió (fila 'pedido') o hay reuniones nuevas desde la última

Lee las métricas de `hoy_reuniones` (las calcula reuniones.py) y una muestra de lo que dijo Alex en cada
una; escribe con `claude -p` (suscripción) y guarda una fila por versión en `hoy_meetings_perfil`.
"""
import datetime as dt
import fcntl
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
from bitacora import OWNER, CASA, conexion, log, _llamar_claude  # noqa: E402
from reuniones import _segmentos, _wispr  # noqa: E402

MODELO = os.environ.get('PERFIL_MODELO', 'opus')
DIAS = 30
MUESTRA_POR_REUNION = 7000
CLAVES = ['claridad', 'concision', 'escucha', 'preguntas', 'estructura', 'liderazgo', 'cierre', 'energia']

ESQUEMA = {'type': 'object', 'properties': {
    'titular': {'type': 'string'},
    'resumen': {'type': 'string', 'description': '3-5 frases con números.'},
    'nota_global': {'type': 'number', 'description': '0-100'},
    'confianza': {'type': 'string', 'enum': ['baja', 'media', 'alta']},
    'perfil': {'type': 'object', 'properties': {
        'arquetipo': {'type': 'string', 'description': '2-4 palabras, como la clase de un personaje.'},
        'descripcion': {'type': 'string'},
        'fortalezas': {'type': 'array', 'items': {'type': 'string'}},
        'puntos_ciegos': {'type': 'array', 'items': {'type': 'string'}},
    }, 'required': ['arquetipo', 'descripcion', 'fortalezas', 'puntos_ciegos']},
    'dimensiones': {'type': 'array', 'items': {'type': 'object', 'properties': {
        'clave': {'type': 'string', 'enum': CLAVES}, 'nota': {'type': 'number'}, 'lectura': {'type': 'string'}},
        'required': ['clave', 'nota', 'lectura']}, 'description': 'Exactamente una por clave, en el orden dado.'},
    'forma_de_hablar': {'type': 'object', 'properties': {
        'ritmo': {'type': 'string', 'description': 'Velocidad, longitud de turnos, cuánto ocupa.'},
        'vocabulario': {'type': 'string', 'description': 'Registro, palabras y giros propios, anglicismos.'},
        'muletillas': {'type': 'array', 'items': {'type': 'object', 'properties': {
            'palabra': {'type': 'string'}, 'por_mil': {'type': 'number'}, 'lectura': {'type': 'string'}},
            'required': ['palabra', 'por_mil', 'lectura']}},
    }, 'required': ['ritmo', 'vocabulario', 'muletillas']},
    'estilo_en_reuniones': {'type': 'object', 'properties': {
        'como_abre': {'type': 'string'}, 'como_dirige': {'type': 'string'}, 'como_cierra': {'type': 'string'},
        'con_quien_cambia': {'type': 'string', 'description': 'Si cambia según con quién habla (Pere, clientes, equipo).'},
    }, 'required': ['como_abre', 'como_dirige', 'como_cierra', 'con_quien_cambia']},
    'momentos': {'type': 'array', 'items': {'type': 'object', 'properties': {
        'reunion': {'type': 'string'}, 'cita': {'type': 'string', 'description': 'Literal de Alex, corta.'},
        'por_que': {'type': 'string'}, 'tono': {'type': 'string', 'enum': ['bien', 'mejorable']}},
        'required': ['reunion', 'cita', 'por_que', 'tono']}},
    'patrones': {'type': 'array', 'items': {'type': 'object', 'properties': {
        'titulo': {'type': 'string'}, 'detalle': {'type': 'string'}}, 'required': ['titulo', 'detalle']}},
    'ejercicios': {'type': 'array', 'items': {'type': 'object', 'properties': {
        'accion': {'type': 'string'}, 'por_que': {'type': 'string'}, 'como_medirlo': {'type': 'string'}},
        'required': ['accion', 'por_que', 'como_medirlo']}},
    'proxima_reunion': {'type': 'object', 'properties': {'foco': {'type': 'string'}, 'objetivo_medible': {'type': 'string'}},
                        'required': ['foco', 'objetivo_medible']},
    'evolucion': {'type': 'string'},
}, 'required': ['titular', 'resumen', 'nota_global', 'confianza', 'perfil', 'dimensiones', 'forma_de_hablar',
                'estilo_en_reuniones', 'momentos', 'patrones', 'ejercicios', 'proxima_reunion', 'evolucion']}

INSTRUCCIONES = """Eres el coach de comunicación de Alex dentro de 2day. Alex es CEO de una consultoría de sistemas para negocios online; le gusta ver sus números como la ficha de un personaje de juego, tan detallada como su ficha física de Fitness.

Te llegan las MÉTRICAS de sus reuniones (medidas sin IA: cuota de tiempo y palabras, palabras por minuto, turnos, monólogos, preguntas, muletillas por cada mil palabras) y una MUESTRA literal de lo que dijo en cada reunión. Escribe su ficha de comunicador:
- Todo en español, directo, tuteándole, sin humo ni frases motivacionales.
- Cada afirmación con su dato o su cita. Las citas, literales y cortas, sacadas de la MUESTRA. No inventes.
- Dimensiones 0-10 (admite medios): claridad · concision · escucha (cuota de tiempo, preguntas, deja hablar) · preguntas (calidad y cantidad) · estructura (orden, agenda) · liderazgo (marca rumbo, decide) · cierre (acaba con acciones, responsables y fechas) · energia.
- Con pocas reuniones, dilo, baja la confianza y puntúa con prudencia: es la línea de salida.
- Ejercicios: 3-5, concretos para la próxima reunión, cada uno con cómo se mide en las métricas de 2day.
- Si hay FICHA_ANTERIOR, compara y explica la evolución; si no, di que esta es la línea de salida.
Responde sólo con el JSON."""


def _muestra(mid, hablantes):
    alex = {k for k, v in (hablantes or {}).items() if v.get('alex')}
    segs = _segmentos(mid)
    if not alex or not segs:
        return ''
    turnos, actual, previo = [], None, ''
    for t, h, x in segs:
        if h in alex:
            actual = (actual or {'t': t, 'antes': previo, 'texto': []})
            actual['texto'].append(x)
        else:
            if actual:
                turnos.append(actual); actual = None
            previo = x
    if actual:
        turnos.append(actual)
    # repartida por la reunión: principio, medio y final, no sólo el arranque
    paso = max(1, len(turnos) // 40)
    trozos = []
    for tu in turnos[::paso]:
        mm = f"{(tu['t'] or 0) // 60:02d}:{(tu['t'] or 0) % 60:02d}"
        trozos.append(f"[{mm}] (antes: «{tu['antes'][:120]}») ALEX: {' '.join(tu['texto'])}")
    return '\n'.join(trozos)[:MUESTRA_POR_REUNION]


def _agregadas(lista):
    con = [m for _, _, m, _ in lista if m]
    if not con:
        return {}
    media = lambda k: round(sum(m[k] or 0 for m in con if m.get(k) is not None) / max(1, sum(1 for m in con if m.get(k) is not None)), 1)
    mule = {}
    for m in con:
        for k, v in (m.get('muletillas_por_mil') or {}).items():
            mule[k] = mule.get(k, 0) + v
    return {
        'reuniones': len(con), 'minutos_totales': sum(m['minutos'] for m in con),
        'cuota_tiempo_media': media('cuota_tiempo'), 'cuota_palabras_media': media('cuota_palabras'),
        'ppm_medio': media('ppm'), 'pct_preguntas_medio': media('pct_preguntas'), 'turno_medio_s': media('turno_medio_s'),
        'monologos_totales': sum(m['monologos'] for m in con), 'turno_max_s': max(m['turno_max_s'] for m in con),
        'muletillas_por_mil': dict(sorted(((k, round(v / len(con), 1)) for k, v in mule.items()), key=lambda kv: -kv[1])[:10]),
    }


def generar(fila_pedido=None):
    c = conexion()
    cur = c.cursor()
    desde = dt.date.today() - dt.timedelta(days=DIAS)
    cur.execute("""select id, titulo, metricas, hablantes, inicio from hoy_reuniones
                   where owner_id = %s and inicio >= %s order by inicio""", (OWNER, desde))
    filas = cur.fetchall()
    lista = [(i, t, m, h) for i, t, m, h, _ in filas]
    por_reunion = [{'reunion': t, 'fecha': ini.astimezone().strftime('%d-%m %H:%M'), 'metricas': m}
                   for (i, t, m, h), (_, _, _, _, ini) in zip(lista, filas) if m]
    agregadas = _agregadas(lista)
    if not agregadas:
        raise RuntimeError('ninguna reunión con métricas de Alex todavía')
    cur.execute("""select ficha from hoy_meetings_perfil where owner_id = %s and estado = 'listo' order by created_at desc limit 1""", (OWNER,))
    anterior = cur.fetchone()
    entrada = {
        'METRICAS': agregadas, 'POR_REUNION': por_reunion,
        'MUESTRA': {t: _muestra(i, h) for i, t, m, h in lista if m},
        'FICHA_ANTERIOR': anterior[0] if anterior else None,
    }
    ficha = _llamar_claude(entrada, ESQUEMA, INSTRUCCIONES, modelo=MODELO)
    metricas = {'agregadas': agregadas, 'por_reunion': por_reunion}
    if fila_pedido:
        cur.execute("""update hoy_meetings_perfil set estado = 'listo', desde = %s, hasta = %s, modelo = %s, metricas = %s, ficha = %s
                       where id = %s""", (desde, dt.date.today(), MODELO, json.dumps(metricas), json.dumps(ficha), fila_pedido))
    else:
        cur.execute("""insert into hoy_meetings_perfil (owner_id, estado, desde, hasta, modelo, metricas, ficha)
                       values (%s, 'listo', %s, %s, %s, %s, %s)""", (OWNER, desde, dt.date.today(), MODELO, json.dumps(metricas), json.dumps(ficha)))
    c.commit()
    c.close()
    log('perfil meetings', ficha.get('perfil', {}).get('arquetipo'), ficha.get('nota_global'))
    return ficha


def si_toca():
    c = conexion()
    cur = c.cursor()
    cur.execute("select id from hoy_meetings_perfil where owner_id = %s and estado = 'pedido' order by created_at limit 1", (OWNER,))
    pedido = cur.fetchone()
    cur.execute("select max(created_at) from hoy_meetings_perfil where owner_id = %s and estado = 'listo'", (OWNER,))
    ultima = cur.fetchone()[0]
    cur.execute("select count(*) from hoy_reuniones where owner_id = %s and metricas is not null and procesada_en > coalesce(%s, 'epoch')", (OWNER, ultima))
    nuevas = cur.fetchone()[0]
    c.close()
    if pedido:
        return pedido[0]
    return 'nueva' if nuevas else None


if __name__ == '__main__':
    os.makedirs(CASA, exist_ok=True)
    candado = open(os.path.join(CASA, 'perfil.lock'), 'w')
    try:
        fcntl.flock(candado, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        sys.exit(0)
    if '--si-toca' in sys.argv:
        toca = si_toca()
        if not toca:
            sys.exit(0)
        try:
            generar(None if toca == 'nueva' else toca)
        except Exception as e:
            log('perfil meetings ERROR', repr(e)[:300])
            if toca != 'nueva':
                c = conexion()
                with c, c.cursor() as cur:
                    cur.execute("update hoy_meetings_perfil set estado = 'error', error = %s where id = %s", (str(e)[:500], toca))
            sys.exit(1)
    else:
        f = generar()
        print(f.get('perfil', {}).get('arquetipo'), f.get('nota_global'))

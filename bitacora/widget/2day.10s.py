#!/usr/bin/python3
# -*- coding: utf-8 -*-
# <swiftbar.title>2day</swiftbar.title>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>false</swiftbar.hideLastUpdated>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
# <swiftbar.hideSwiftBar>true</swiftbar.hideSwiftBar>
"""
El widget de 2day en la barra de menús (LOGICA §14.8). SwiftBar lo ejecuta cada 10 s.
Arriba: ● terminales trabajando · ◐ en revisión · ✦ próximos por validar. Al desplegar, todo,
con acciones que van por el comando `2day` (una sola puerta).
"""
import datetime as dt
import os
import sys

BITACORA = '/Users/alex/CORE/2day/bitacora'
sys.path.insert(0, BITACORA)
DOSDAY = f'{BITACORA}/dosday.py'
ENFOCAR = f'{BITACORA}/enfocar.sh'
NARANJA, AZUL, VERDE, GRIS = '#ff6a1a', '#4c8dff', '#3ec27a', '#8a8f98'


def limpio(texto, n=60):
    t = ' '.join(str(texto or '').split()).replace('|', '¦')
    return t if len(t) <= n else t[:n - 1] + '…'


def hace(ts):
    m = max(0, int((dt.datetime.now(dt.timezone.utc) - ts).total_seconds() // 60))
    return 'ahora' if m < 1 else f'{m} min' if m < 60 else f'{m // 60} h {m % 60:02d}'


def accion(*args):
    """Parámetros SwiftBar para correr `2day <args>` sin abrir terminal y refrescar."""
    ps = ' '.join(f'param{i + 2}="{a}"' for i, a in enumerate(args))
    return f'bash=/usr/bin/python3 param1={DOSDAY} {ps} terminal=false refresh=true'


def main():
    try:
        from bitacora import OWNER, conexion, _dia_logico
        c = conexion()
    except Exception as e:  # sin red o sin vault: que se vea, no que desaparezca
        print('2day ⚠︎')
        print('---')
        print(f'Sin conexión con la base: {limpio(e, 80)} | color={GRIS}')
        return
    cur = c.cursor()
    hoy = _dia_logico(dt.datetime.now().astimezone())

    cur.execute("""select id, coalesce(nullif(titulo, ''), carpeta), activo_pedido, activo_desde, tty from hoy_cc_sesiones
                   where owner_id = %s and activo_desde > now() - interval '3 hours' order by activo_desde""", (OWNER,))
    activas = cur.fetchall()
    cur.execute("""select s.id, coalesce(nullif(s.titulo, ''), s.carpeta), count(*) from hoy_cc_pasos p join hoy_cc_sesiones s on s.id = p.sesion_id
                   where p.owner_id = %s and not p.procesado and (s.activo_desde is null or s.activo_desde < now() - interval '3 hours')
                   group by s.id""", (OWNER,))
    clasificando = cur.fetchall()
    cur.execute("""select t.id, t.titulo, coalesce(p.nombre, '') from hoy_tareas t left join hoy_proyectos p on p.id = t.proyecto_id
                   where t.owner_id = %s and t.estado = 'review' and not t.hecha and t.archivado_at is null
                   order by t.updated_at desc""", (OWNER,))
    revision = cur.fetchall()
    cur.execute("""select t.id, t.titulo, coalesce(p.nombre, '') from hoy_tareas t left join hoy_proyectos p on p.id = t.proyecto_id
                   where t.owner_id = %s and t.estado = 'in_progress' and not t.hecha and t.archivado_at is null
                     and exists (select 1 from hoy_cc_pasos x where x.tarea_id = t.id)
                   order by t.updated_at desc limit 15""", (OWNER,))
    en_curso = cur.fetchall()
    cur.execute("""select x.id, x.titulo, x.dia, coalesce(nullif(s.titulo, ''), s.carpeta, r.titulo, 'Propuestos por Claude'),
                          coalesce(r.inicio, s.ultimo, x.created_at)
                   from hoy_proximos x left join hoy_cc_sesiones s on s.id = x.sesion_id left join hoy_reuniones r on r.id = x.reunion_id
                   where x.owner_id = %s and x.estado = 'propuesto' order by 5 desc, x.orden""", (OWNER,))
    proximos = cur.fetchall()
    # «Completado hoy»: lo cerrado desde las 04:00 de hoy (el día lógico); mañana se limpia solo.
    cur.execute("""select t.id, t.titulo, coalesce(p.nombre, cl.name, ''), t.hecha_en from hoy_tareas t
                   left join hoy_proyectos p on p.id = t.proyecto_id left join clients cl on cl.id = t.client_id
                   where t.owner_id = %s and t.hecha and t.archivado_at is null and t.hecha_en >= %s
                   order by t.hecha_en desc""", (OWNER, dt.datetime.combine(hoy, dt.time(4)).astimezone()))
    completadas = cur.fetchall()
    cur.execute("""select titulo, inicio, minutos from hoy_reuniones where owner_id = %s and inicio > now() - interval '24 hours'
                   order by inicio desc""", (OWNER,))
    reuniones = cur.fetchall()
    cur.execute("""select count(*) filter (where t.hecha and t.hecha_en >= %s), count(*) filter (where not t.hecha and k.hoy_para = %s)
                   from hoy_tareas t left join hoy_capa k on k.tarea_id = t.id where t.owner_id = %s and t.archivado_at is null""",
                (dt.datetime.combine(hoy, dt.time(4)).astimezone(), hoy, OWNER))
    hechas_hoy, en_hoy = cur.fetchone()
    c.close()

    # ── la barra ──
    partes = []
    if activas:
        partes.append(f'● {len(activas)}')
    if revision:
        partes.append(f'◐ {len(revision)}')
    if proximos:
        partes.append(f'✦ {len(proximos)}')
    if completadas:
        partes.append(f'✓ {len(completadas)}')
    color = f' color={NARANJA}' if activas else ''
    print('  '.join(partes) + f' |{color}' if partes else '2day | sfimage=checklist')
    print('---')
    print(f'▣ Panel visual (abrir / cerrar) | bash={BITACORA}/panel.sh terminal=false')
    print('---')

    # ── trabajando ahora ──
    print(f'Trabajando ahora ({len(activas)}) | size=11 color={GRIS}')
    if not activas:
        print('Ninguna terminal trabajando | color=' + GRIS)
    for sid, titulo, pedido, desde, tty in activas:
        extra = f'bash={ENFOCAR} param1={tty} terminal=false' if tty else ''
        print(f'● {limpio(pedido, 55)}  ·  {hace(desde)} | color={NARANJA} {extra}')
        print(f'-- {limpio(titulo, 70)} | color={GRIS}')
        if tty:
            print(f'-- Ir a la terminal | {extra}')
    for sid, titulo, n in clasificando:
        print(f'◌ Clasificando {n} {"paso" if n == 1 else "pasos"} · {limpio(titulo, 40)} | color={GRIS}')

    # ── revisión ──
    print('---')
    print(f'En revisión ({len(revision)}) | size=11 color={GRIS}')
    for tid, titulo, proyecto in revision[:15]:
        print(f'◐ {limpio(titulo)} | color={AZUL}')
        if proyecto:
            print(f'-- {limpio(proyecto, 40)} | color={GRIS}')
        print(f'-- ✓ Completar | {accion("completar", str(tid)[:8])}')
        print(f'-- ↩ Devolver a En curso | {accion("mover", str(tid)[:8], "in_progress")}')
    if en_curso:
        print(f'En curso ({len(en_curso)}) | color={GRIS}')
        for tid, titulo, proyecto in en_curso:
            print(f'-- {limpio(titulo)} | color=#e8b13a')
            print(f'---- → Pasar a revisión | {accion("mover", str(tid)[:8], "review")}')
            print(f'---- ✓ Completar | {accion("completar", str(tid)[:8])}')

    # ── próximos ──
    print('---')
    print(f'Próximos por validar ({len(proximos)}) | size=11 color={GRIS}')
    grupo = None
    for pid, titulo, dia, de, _ in proximos[:25]:
        if de != grupo:
            grupo = de
            print(f'{limpio(de, 50)} | color={GRIS} size=11')
        cuando = 'hoy' if dia == hoy else 'mañana' if dia == hoy + dt.timedelta(days=1) else (dia.strftime('%d-%m') if dia else '')
        print(f'✦ {limpio(titulo, 55)}  ·  {cuando}')
        print(f'-- ✓ Aceptar ({cuando}) | {accion("aceptar", str(pid)[:8])}')
        print(f'-- ✓ Aceptar para hoy | {accion("aceptar", str(pid)[:8], "--dia", "hoy")}')
        print(f'-- ✓ Aceptar para mañana | {accion("aceptar", str(pid)[:8], "--dia", "mañana")}')
        print(f'-- ✕ Descartar | {accion("descartar", str(pid)[:8])}')
    if len(proximos) > 25:
        print(f'… y {len(proximos) - 25} más en 2day | href=http://localhost:5400 color={GRIS}')

    # ── completado hoy ──
    print('---')
    print(f'Completado hoy ({len(completadas)}) | size=11 color={GRIS}')
    if not completadas:
        print(f'Nada cerrado todavía hoy | color={GRIS}')
    for tid, titulo, proyecto, cuando in completadas[:15]:
        print(f'✓ {limpio(titulo)}  ·  {cuando.astimezone().strftime("%H:%M")} | color={VERDE}')
        if proyecto:
            print(f'-- {limpio(proyecto, 40)} | color={GRIS}')
        print(f'-- ↩ Reabrir (a En curso) | {accion("mover", str(tid)[:8], "in_progress")}')
    if len(completadas) > 15:
        print(f'… y {len(completadas) - 15} más | color={GRIS}')

    # ── reuniones y el día ──
    if reuniones:
        print('---')
        print(f'Reuniones · últimas 24 h | size=11 color={GRIS}')
        for titulo, inicio, minutos in reuniones:
            print(f'🎙 {limpio(titulo, 55)}  ·  {inicio.astimezone().strftime("%H:%M")} · {minutos or 0} min')
    print('---')
    print(f'Hoy: {hechas_hoy} hechas · {en_hoy} pendientes en Hoy | color={VERDE}')
    print('Abrir 2day | href=http://localhost:5400')
    print('Empezar (2day + 4 terminales) | bash=/usr/bin/open param1=/Users/alex/Applications/Empezar.app terminal=false')
    print('Refrescar | refresh=true')


main()

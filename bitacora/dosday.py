#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
2day desde la terminal (LOGICA §14.6): las manos de Claude en la app de Alex.

  2day ver [texto] [--proyecto P] [--estado E] [--todas]     tareas vivas (o todas) y próximos propuestos
  2day crear "Título" [opciones]                             tarea nueva
  2day mover <tarea> todo|in_progress|review|blocked          cambiar de columna
  2day editar <tarea> [opciones] [--titulo T]                 cambiar campos
  2day completar <tarea>                                      SÓLO si Alex lo pide (Completado es suyo)
  2day archivar <tarea>
  2day proximo "Título" [opciones]                            próximo paso para que Alex lo valide
  2day aceptar <próximo> [--dia F] [--nueva] · 2day descartar <próximo>  validar un próximo paso (Alex);
                                                              si ya hay una tarea igual, se enlaza a ella (--nueva la crea igual)
  2day proyecto "Nombre" [--color #hex]                       crear (o reusar) proyecto
  2day proyectos · 2day categorias · 2day frentes   (--proyecto acepta también un cliente de GrowthInfo: Elena, Jonathan…)
  2day categoria "Nombre" [--clave k] [--color #hex]
  2day frente "Hito" --frente "Frente" [--fecha F]            hito de un frente
  2day frente-hecho <hito>

Opciones de tarea: --desc D · --proyecto P · --categoria C · --cuadrante q1..q4 · --dia hoy|mañana|AAAA-MM-DD
                   · --vence F · --estado todo|in_progress|review|blocked · --minutos N (sólo proximo)
<tarea> = principio del id o un trozo único del título. Proyecto y categoría por nombre (o clave).
"""
import datetime as dt
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
from bitacora import OWNER, COLORES, conexion, _dia_logico, parecida  # noqa: E402

ESTADOS = ('todo', 'in_progress', 'review', 'blocked')
NOMBRE_ESTADO = {'todo': 'Por hacer', 'in_progress': 'En curso', 'review': 'En revisión', 'blocked': 'Bloqueada', 'done': 'Completada'}


class Fallo(Exception):
    pass


def opciones(argv):
    """→ (posicionales, {opcion: valor})."""
    pos, op, i = [], {}, 0
    while i < len(argv):
        a = argv[i]
        if a.startswith('--'):
            clave = a[2:]
            if i + 1 < len(argv) and not argv[i + 1].startswith('--'):
                op[clave] = argv[i + 1]
                i += 2
            else:
                op[clave] = True
                i += 1
        else:
            pos.append(a)
            i += 1
    return pos, op


def fecha(texto):
    if texto in (None, True, ''):
        return None
    hoy = _dia_logico(dt.datetime.now().astimezone())
    t = str(texto).lower()
    if t == 'hoy':
        return hoy
    if t in ('mañana', 'manana'):
        return hoy + dt.timedelta(days=1)
    if t in ('pasado', 'pasado-mañana'):
        return hoy + dt.timedelta(days=2)
    try:
        return dt.date.fromisoformat(t)
    except ValueError:
        raise Fallo(f'fecha no válida: {texto} (hoy · mañana · AAAA-MM-DD)')


def proyecto_id(cur, nombre, crear=False):
    if not nombre:
        return None
    cur.execute("select id, nombre from hoy_proyectos where owner_id = %s and archivado_at is null", (OWNER,))
    filas = cur.fetchall()
    n = nombre.strip().lower()
    exactos = [i for i, x in filas if x.lower() == n]
    if exactos:
        return exactos[0]
    parecidos = [(i, x) for i, x in filas if n in x.lower()]
    if len(parecidos) == 1:
        return parecidos[0][0]
    if crear:
        return crear_proyecto(cur, nombre.strip())
    raise Fallo(f'no hay un proyecto «{nombre}» claro. Existen: ' + ', '.join(x for _, x in filas) + '. Créalo con `2day proyecto "…"`.')


def destino(cur, nombre):
    """§14.9: «--proyecto X» → (proyecto_id, client_id). Un cliente vivo de GrowthInfo gana si el nombre es suyo."""
    if not nombre:
        return None, None
    cur.execute("""select id, name from clients where scope = 'growthinfo' and archivado_at is null and deleted_at is null""")
    n = nombre.strip().lower()
    clientes = [(i, x) for i, x in cur.fetchall() if n in (i.lower(), x.lower()) or n in x.lower().split()]
    if len(clientes) == 1:
        return None, clientes[0][0]
    return proyecto_id(cur, nombre), None


def crear_proyecto(cur, nombre, color=None):
    cur.execute("select count(*) from hoy_proyectos where owner_id = %s", (OWNER,))
    n = cur.fetchone()[0]
    cur.execute("insert into hoy_proyectos (owner_id, nombre, color, posicion) values (%s, %s, %s, %s) returning id",
                (OWNER, nombre, color or COLORES[n % len(COLORES)], 200 + n))
    return cur.fetchone()[0]


def categoria_clave(cur, texto):
    if not texto:
        return None
    cur.execute("select clave, nombre from hoy_categorias where owner_id = %s and archivado_at is null", (OWNER,))
    filas = cur.fetchall()
    t = texto.strip().lower()
    for clave, nombre in filas:
        if t in (clave.lower(), nombre.lower()):
            return clave
    raise Fallo(f'no hay categoría «{texto}». Existen: ' + ', '.join(f'{n} ({c})' for c, n in filas) + '. Créala con `2day categoria "…"`.')


def tarea(cur, ref):
    """Por principio de id o por trozo único del título (sólo personales, no archivadas)."""
    cur.execute("""select id, titulo, estado, hecha, pipeline_id from hoy_tareas
                   where owner_id = %s and archivado_at is null
                     and (id::text like %s or titulo ilike %s)
                   order by hecha, updated_at desc""", (OWNER, ref.lower() + '%', f'%{ref}%'))
    filas = cur.fetchall()
    exacta = [f for f in filas if f[1].lower() == ref.lower() or str(f[0]).startswith(ref.lower())]
    if len(exacta) == 1:
        filas = exacta
    if not filas:
        raise Fallo(f'no encuentro la tarea «{ref}» (usa `2day ver {ref}`)')
    if len(filas) > 1:
        raise Fallo(f'«{ref}» es ambiguo:\n' + '\n'.join(f'  {str(i)[:8]}  {t}' for i, t, *_ in filas[:10]))
    return filas[0]


def etapa(cur, pipeline, clave):
    if not pipeline:
        cur.execute("select id from hoy_pipelines where owner_id = %s order by created_at limit 1", (OWNER,))
        f = cur.fetchone()
        pipeline = f[0] if f else None
    if not pipeline:
        return None, None
    cur.execute("select id from hoy_etapas where pipeline_id = %s and clave = %s", (pipeline, clave))
    f = cur.fetchone()
    return pipeline, (f[0] if f else None)


def capa(cur, tarea_id, **campos):
    campos = {k: v for k, v in campos.items() if v is not None}
    if not campos:
        return
    cols = ', '.join(campos)
    marcas = ', '.join(['%s'] * len(campos))
    sets = ', '.join(f'{k} = excluded.{k}' for k in campos)
    cur.execute(f"""insert into hoy_capa (tarea_id, owner_id, origen, {cols}) values (%s, %s, 'hoy', {marcas})
                    on conflict (tarea_id) do update set {sets}, updated_at = now()""",
                (tarea_id, OWNER, *campos.values()))


def cuadrante(op):
    q = op.get('cuadrante')
    if q and q not in ('q1', 'q2', 'q3', 'q4'):
        raise Fallo('cuadrante: q1 · q2 · q3 · q4')
    return q or None


# ── órdenes ─────────────────────────────────────────────────────────────────────

def ver(cur, pos, op):
    filtro, args = ["t.owner_id = %s", "t.archivado_at is null"], [OWNER]
    if not op.get('todas'):
        filtro.append("not t.hecha")
    if pos:
        filtro.append("t.titulo ilike %s")
        args.append(f'%{pos[0]}%')
    if op.get('estado'):
        filtro.append("t.estado = %s")
        args.append(op['estado'])
    if op.get('proyecto'):
        pid, cid = destino(cur, op['proyecto'])
        filtro.append("(t.proyecto_id = %s or t.client_id = %s)")
        args += [pid, cid]
    cur.execute(f"""select t.id, t.titulo, t.estado, t.hecha, coalesce(p.nombre, cl.name, '—'), k.hoy_para, k.cuadrante
                    from hoy_tareas t left join hoy_proyectos p on p.id = t.proyecto_id left join clients cl on cl.id = t.client_id
                    left join hoy_capa k on k.tarea_id = t.id
                    where {' and '.join(filtro)} order by t.updated_at desc limit 60""", args)
    for i, titulo, estado, hecha, proy, dia, q in cur.fetchall():
        print(f"{str(i)[:8]}  {NOMBRE_ESTADO['done' if hecha else estado]:<11}  {proy[:18]:<18}  {str(dia or ''):<10}  {q or '  '}  {titulo}")
    if op.get('estado'):
        return
    filtro, args = ["x.owner_id = %s", "x.estado = 'propuesto'"], [OWNER]
    if pos:
        filtro.append("x.titulo ilike %s")
        args.append(f'%{pos[0]}%')
    if op.get('proyecto'):
        filtro.append("(x.proyecto_id = %s or x.client_id = %s)")
        args += [pid, cid]
    cur.execute(f"""select x.id, x.titulo, coalesce(p.nombre, cl.name, '—'), x.dia, x.cuadrante
                    from hoy_proximos x left join hoy_proyectos p on p.id = x.proyecto_id left join clients cl on cl.id = x.client_id
                    where {' and '.join(filtro)} order by x.dia nulls last, x.orden""", args)
    for i, titulo, proy, dia, q in cur.fetchall():
        print(f"{str(i)[:8]}  {'Próximo':<11}  {proy[:18]:<18}  {str(dia or ''):<10}  {q or '  '}  {titulo}")


def crear(cur, pos, op):
    if not pos:
        raise Fallo('falta el título')
    estado = op.get('estado', 'todo')
    if estado not in ESTADOS:
        raise Fallo('estado: ' + ' · '.join(ESTADOS))
    pipeline, et = etapa(cur, None, estado)
    cur.execute("""insert into hoy_tareas (owner_id, titulo, descripcion, proyecto_id, client_id, categoria, pipeline_id, etapa_id, estado, vence)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
                (OWNER, pos[0], op.get('desc', ''), *destino(cur, op.get('proyecto')), categoria_clave(cur, op.get('categoria')),
                 pipeline, et, estado, fecha(op.get('vence'))))
    nueva = cur.fetchone()[0]
    capa(cur, nueva, hoy_para=fecha(op.get('dia')), cuadrante=cuadrante(op), notas='Creada por Claude Code')
    print(f'creada {str(nueva)[:8]}  {pos[0]}')


def mover(cur, pos, op):
    if len(pos) < 2 or pos[1] not in ESTADOS:
        raise Fallo('uso: 2day mover <tarea> ' + '|'.join(ESTADOS) + '  (completar es aparte y sólo si Alex lo pide)')
    i, titulo, _, hecha, pipeline = tarea(cur, pos[0])
    _, et = etapa(cur, pipeline, pos[1])
    cur.execute("""update hoy_tareas set estado = %s, etapa_id = coalesce(%s, etapa_id), hecha = false, updated_at = now()
                   where id = %s""", (pos[1], et, i))
    print(f'{str(i)[:8]}  {titulo}  →  {NOMBRE_ESTADO[pos[1]]}' + ('  (estaba completada: reabierta)' if hecha else ''))


def completar(cur, pos, op):
    if not pos:
        raise Fallo('falta la tarea')
    i, titulo, _, _, pipeline = tarea(cur, pos[0])
    _, et = etapa(cur, pipeline, 'done')
    cur.execute("update hoy_tareas set estado = 'done', etapa_id = coalesce(%s, etapa_id), hecha = true, updated_at = now() where id = %s", (et, i))
    print(f'{str(i)[:8]}  {titulo}  →  Completada')


def editar(cur, pos, op):
    if not pos:
        raise Fallo('falta la tarea')
    i, titulo, *_ = tarea(cur, pos[0])
    sets, args = [], []
    for campo, col, conv in (('titulo', 'titulo', str), ('desc', 'descripcion', str),
                             ('categoria', 'categoria', lambda v: categoria_clave(cur, v)),
                             ('vence', 'vence', fecha)):
        if campo in op:
            sets.append(f'{col} = %s')
            args.append(conv(op[campo]))
    if 'proyecto' in op:
        sets += ['proyecto_id = %s', 'client_id = %s']
        args += list(destino(cur, op['proyecto']))
    if sets:
        cur.execute(f"update hoy_tareas set {', '.join(sets)}, updated_at = now() where id = %s", (*args, i))
    dia = op.get('dia')
    capa(cur, i, hoy_para=fecha(dia) if dia not in (None, 'ninguno') else None, cuadrante=cuadrante(op))
    if dia == 'ninguno':
        cur.execute("update hoy_capa set hoy_para = null where tarea_id = %s", (i,))
    print(f'editada {str(i)[:8]}  {op.get("titulo", titulo)}')


def archivar(cur, pos, op):
    i, titulo, *_ = tarea(cur, pos[0] if pos else '')
    cur.execute("update hoy_tareas set archivado_at = now() where id = %s", (i,))
    print(f'archivada {str(i)[:8]}  {titulo}')


def proximo(cur, pos, op):
    if not pos:
        raise Fallo('falta el título')
    igual = _tarea_igual(cur, pos[0])
    if igual:
        raise Fallo(f'ya hay una tarea así: {str(igual[0])[:8]}  {igual[1]} (muévela en vez de proponerla)')
    cur.execute("""insert into hoy_proximos (owner_id, titulo, descripcion, proyecto_id, categoria, cuadrante, dia, minutos, origen)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, 'claude') returning id""",
                (OWNER, pos[0], op.get('desc', ''), proyecto_id(cur, op.get('proyecto')), categoria_clave(cur, op.get('categoria')),
                 cuadrante(op), fecha(op.get('dia')), int(op['minutos']) if op.get('minutos') else None))
    print(f'próximo paso propuesto {str(cur.fetchone()[0])[:8]}  {pos[0]}  (Alex lo valida en Tareas → Claude → Próximos)')


def _tarea_igual(cur, titulo):
    """§14.6: la tarea viva (o cerrada hace poco) que ya dice lo mismo que `titulo`, o None."""
    cur.execute("""select id, titulo from hoy_tareas where owner_id = %s and archivado_at is null
                     and (not hecha or hecha_en > now() - interval '3 days')""", (OWNER,))
    filas = cur.fetchall()
    igual = parecida(titulo, [t for _, t in filas])
    return next(f for f in filas if f[1] == igual) if igual else None


def _proximo(cur, ref):
    cur.execute("""select id, titulo, descripcion, proyecto_id, categoria, cuadrante, dia, client_id from hoy_proximos
                   where owner_id = %s and estado = 'propuesto' and (id::text like %s or titulo ilike %s)""",
                (OWNER, ref.lower() + '%', f'%{ref}%'))
    filas = cur.fetchall()
    if len(filas) != 1:
        raise Fallo(f'próximo «{ref}» no encontrado o ambiguo:\n' + '\n'.join(f'  {str(f[0])[:8]}  {f[1]}' for f in filas[:10]))
    return filas[0]


def aceptar(cur, pos, op):
    """Lo mismo que «Aceptar» en la app: la tarea nace planificada para su día, ya clasificada."""
    i, titulo, desc, proy, cat, q, dia, cliente = _proximo(cur, pos[0] if pos else '')
    igual = None if op.get('nueva') else _tarea_igual(cur, titulo)
    if igual:
        cur.execute("update hoy_proximos set estado = 'aceptado', tarea_id = %s, decidido_en = now() where id = %s", (igual[0], i))
        print(f'aceptado → ya existía la tarea {str(igual[0])[:8]}  {igual[1]} (enlazado, sin duplicar; --nueva para crear otra)')
        return
    hoy = _dia_logico(dt.datetime.now().astimezone())
    dia = fecha(op['dia']) if op.get('dia') else max(dia or hoy, hoy)
    pipeline, et = etapa(cur, None, 'todo')
    cur.execute("""insert into hoy_tareas (owner_id, titulo, descripcion, proyecto_id, client_id, categoria, pipeline_id, etapa_id, estado)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, 'todo') returning id""", (OWNER, titulo, desc, proy, cliente, cat, pipeline, et))
    nueva = cur.fetchone()[0]
    capa(cur, nueva, hoy_para=dia, cuadrante=q, notas='Próximo paso validado desde la bitácora de Claude')
    cur.execute("update hoy_proximos set estado = 'aceptado', tarea_id = %s, dia = %s, decidido_en = now() where id = %s", (nueva, dia, i))
    print(f'aceptado → tarea {str(nueva)[:8]} para el {dia}  {titulo}')


def descartar(cur, pos, op):
    i, titulo, *_ = _proximo(cur, pos[0] if pos else '')
    cur.execute("update hoy_proximos set estado = 'descartado', decidido_en = now() where id = %s", (i,))
    print(f'descartado  {titulo}')


def proyecto(cur, pos, op):
    if not pos:
        raise Fallo('falta el nombre')
    try:
        i = proyecto_id(cur, pos[0])
        print(f'ya existe {str(i)[:8]}  {pos[0]}')
    except Fallo:
        i = crear_proyecto(cur, pos[0].strip(), op.get('color'))
        print(f'proyecto creado {str(i)[:8]}  {pos[0]}')


def proyectos(cur, pos, op):
    cur.execute("""select p.nombre, count(t.id) filter (where not t.hecha and t.archivado_at is null)
                   from hoy_proyectos p left join hoy_tareas t on t.proyecto_id = p.id
                   where p.owner_id = %s and p.archivado_at is null group by p.id order by p.posicion""", (OWNER,))
    for n, vivas in cur.fetchall():
        print(f'{vivas:>3} vivas  {n}')


def categoria(cur, pos, op):
    if not pos:
        raise Fallo('falta el nombre')
    clave = op.get('clave') or re.sub(r'[^a-z0-9]+', '_', pos[0].lower()).strip('_')
    cur.execute("select clave from hoy_categorias where owner_id = %s and (clave = %s or lower(nombre) = lower(%s))", (OWNER, clave, pos[0]))
    if cur.fetchone():
        print(f'ya existe {clave}')
        return
    cur.execute("select coalesce(max(posicion), 0) + 1 from hoy_categorias where owner_id = %s", (OWNER,))
    cur.execute("insert into hoy_categorias (owner_id, clave, nombre, color, posicion) values (%s, %s, %s, %s, %s)",
                (OWNER, clave, pos[0], op.get('color') or '#8a8f98', cur.fetchone()[0]))
    print(f'categoría creada {clave}  {pos[0]}')


def categorias(cur, pos, op):
    cur.execute("select clave, nombre from hoy_categorias where owner_id = %s and archivado_at is null order by posicion", (OWNER,))
    for c, n in cur.fetchall():
        print(f'{c:<12} {n}')


def frente(cur, pos, op):
    if not pos or not op.get('frente'):
        raise Fallo('uso: 2day frente "Hito" --frente "Frente" [--fecha F]')
    cur.execute("select coalesce(max(posicion), 0) + 1 from hoy_hitos where owner_id = %s", (OWNER,))
    cur.execute("""insert into hoy_hitos (owner_id, nombre, frente, fecha, posicion) values (%s, %s, %s, %s, %s)
                   on conflict (owner_id, frente, nombre) do update set fecha = coalesce(excluded.fecha, hoy_hitos.fecha), updated_at = now()
                   returning id""", (OWNER, pos[0], op['frente'], fecha(op.get('fecha')), cur.fetchone()[0]))
    print(f'hito {str(cur.fetchone()[0])[:8]}  {op["frente"]}: {pos[0]}')


def frente_hecho(cur, pos, op):
    cur.execute("select id, frente, nombre from hoy_hitos where owner_id = %s and (id::text like %s or nombre ilike %s)",
                (OWNER, (pos[0] if pos else '') + '%', f'%{pos[0] if pos else ""}%'))
    filas = cur.fetchall()
    if len(filas) != 1:
        raise Fallo('hito no encontrado o ambiguo:\n' + '\n'.join(f'  {str(i)[:8]}  {f}: {n}' for i, f, n in filas[:10]))
    cur.execute("update hoy_hitos set hecho = true, updated_at = now() where id = %s", (filas[0][0],))
    print(f'hecho  {filas[0][1]}: {filas[0][2]}')


def frentes(cur, pos, op):
    cur.execute("select frente, nombre, fecha, hecho from hoy_hitos where owner_id = %s order by frente, fecha nulls last", (OWNER,))
    for f, n, fe, h in cur.fetchall():
        print(f"{'✓' if h else '·'} {f[:22]:<22} {str(fe or ''):<10}  {n}")


ORDENES = {'ver': ver, 'crear': crear, 'mover': mover, 'editar': editar, 'completar': completar, 'archivar': archivar,
           'proximo': proximo, 'próximo': proximo, 'aceptar': aceptar, 'descartar': descartar, 'proyecto': proyecto, 'proyectos': proyectos, 'categoria': categoria,
           'categorias': categorias, 'frente': frente, 'frente-hecho': frente_hecho, 'frentes': frentes}


def main(argv):
    if not argv or argv[0] not in ORDENES:
        print(__doc__)
        return 0 if not argv or argv[0] in ('ayuda', '-h', '--help') else 1
    pos, op = opciones(argv[1:])
    c = conexion()
    try:
        with c, c.cursor() as cur:
            ORDENES[argv[0]](cur, pos, op)
    except Fallo as e:
        print(f'2day: {e}', file=sys.stderr)
        return 1
    finally:
        c.close()
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

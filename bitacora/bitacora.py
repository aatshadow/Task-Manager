#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bitácora de Claude (LOGICA §14): las sesiones de Claude Code se apuntan solas en 2day.

  bitacora.py hook                    # UserPromptSubmit / Stop / SessionEnd de Claude Code (lee stdin, vuelve al instante)
  bitacora.py activo <sesion> <cwd>   # «trabajando ahora» (UserPromptSubmit; el pedido llega por stdin)
  bitacora.py subir <transcript> [--terminada] [--fin-turno] [--procesar]
  bitacora.py barrer [--horas 6]      # relee los transcripts tocados en las últimas N horas
  bitacora.py procesar [--sesion ID] [--ya]   # la IA divide los pasos en tareas
  bitacora.py reclasificar            # rellena proyecto/categoría/cuadrante que falten (§14.5)

Paso = un turno humano: lo que Alex pide y todo lo que Claude hace hasta el siguiente pedido.
El transcript es la fuente; se relee entero y sólo se suben los pasos nuevos o cambiados
(estado en ~/.claude/2day-bitacora/). Escribe con SUPABASE_DB_URL del vault, owner puesto a mano.
"""
import datetime as dt
import fcntl
import glob
import hashlib
import json
import os
import subprocess
import sys

OWNER = 'e0b4c8d6-3799-43fe-a334-022bb3d8a839'  # alex@growthinfo.io
VAULT = os.path.expanduser('~/.core-secrets/growthinfo-supabase.env')
CASA = os.path.expanduser('~/.claude/2day-bitacora')
PROYECTOS = os.path.expanduser('~/.claude/projects')
CLAUDE = os.path.expanduser('~/.local/bin/claude')
YO = os.path.realpath(__file__)

QUIETA_MIN = 2        # §14.0-5: lo normal es procesar en el Stop; el barrido recoge lo que se quedó atrás
TANDA_MAX = 25
PASOS_POR_LLAMADA = 40
HORA_REINICIO = 4     # hoy_ajustes.hora_reinicio
MODELO = os.environ.get('BITACORA_MODELO', 'sonnet')
CHULETA = os.path.join(os.path.dirname(YO), 'proyectos.md')
COLORES = ['#4c8dff', '#3ec27a', '#9b8cff', '#e8b13a', '#ff9448', '#d7263d', '#22b8cf', '#8a8f98']


def log(*a):
    os.makedirs(CASA, exist_ok=True)
    with open(os.path.join(CASA, 'bitacora.log'), 'a') as f:
        f.write(dt.datetime.now().strftime('%m-%d %H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')


def conexion():
    import psycopg2
    url = os.environ.get('SUPABASE_DB_URL')
    if not url:
        for linea in open(VAULT):
            if linea.startswith('SUPABASE_DB_URL='):
                url = linea.split('=', 1)[1].strip().strip('"\'')
    c = psycopg2.connect(url, connect_timeout=15)
    c.autocommit = False
    return c


# ── leer un transcript ──────────────────────────────────────────────────────────

def _texto(contenido):
    if isinstance(contenido, str):
        return contenido
    if isinstance(contenido, list):
        if any(b.get('type') == 'tool_result' for b in contenido if isinstance(b, dict)):
            return None
        return '\n'.join(b.get('text', '') for b in contenido if isinstance(b, dict) and b.get('type') == 'text')
    return None


def _ruido(texto):
    t = texto.lstrip()
    return (not t or t.startswith('<local-command') or t.startswith('<system-reminder')
            or t.startswith('<task-notification') or t.startswith('[Request interrupted'))


COMANDOS_RUIDO = {'/clear', '/compact', '/exit', '/model', '/config', '/resume', '/status', '/cost', '/help', '/login', '/fast'}


def _limpiar_pedido(texto):
    # Un /comando llega envuelto en etiquetas: nos quedamos con «/nombre args».
    if '<command-name>' in texto:
        nombre = texto.split('<command-name>', 1)[1].split('</command-name>', 1)[0]
        args = texto.split('<command-args>', 1)[1].split('</command-args>', 1)[0] if '<command-args>' in texto else ''
        return f'{nombre} {args}'.strip()
    return texto.replace('<pasted_content', '«pegado').strip()


def leer_transcript(ruta):
    """→ (meta, [paso]). Cada paso: id, inicio, fin, pedido, respuesta, herramientas, archivos, comandos."""
    meta = {'id': os.path.basename(ruta)[:-6], 'cwd': '', 'titulo': ''}
    pasos, actual = [], None
    with open(ruta, errors='replace') as f:
        for linea in f:
            if '"api-request' in linea[:40]:
                continue
            try:
                d = json.loads(linea)
            except ValueError:
                continue
            tipo = d.get('type')
            if tipo == 'ai-title':
                meta['titulo'] = d.get('aiTitle') or meta['titulo']
                continue
            if d.get('isSidechain'):
                continue
            ts = d.get('timestamp')
            if d.get('cwd') and not meta['cwd']:
                meta['cwd'] = d['cwd']  # la carpeta donde se abrió, no adonde hizo cd
            if d.get('entrypoint') and not meta.get('entrypoint'):
                meta['entrypoint'] = d['entrypoint']
            if tipo == 'user' and not d.get('isMeta'):
                texto = _texto((d.get('message') or {}).get('content'))
                if texto is not None and not _ruido(texto) and _limpiar_pedido(texto).split(' ')[0] not in COMANDOS_RUIDO:
                    actual = {'id': d.get('uuid'), 'inicio': ts, 'fin': ts, 'pedido': [_limpiar_pedido(texto)],
                              'respuesta': '', 'herramientas': {}, 'archivos': [], 'comandos': []}
                    pasos.append(actual)
                    continue
            if actual is None:
                continue
            if ts:
                actual['fin'] = ts
            if tipo == 'attachment':
                a = d.get('attachment') or {}
                if a.get('type') == 'queued_command' and (a.get('origin') or {}).get('kind') == 'human' and a.get('prompt'):
                    actual['pedido'].append(str(a['prompt']))
            elif tipo == 'assistant':
                for b in (d.get('message') or {}).get('content') or []:
                    if not isinstance(b, dict):
                        continue
                    if b.get('type') == 'text' and b.get('text', '').strip():
                        actual['respuesta'] = b['text']
                    elif b.get('type') == 'tool_use':
                        nombre = b.get('name') or '?'
                        if nombre.startswith('mcp__'):
                            nombre = 'mcp:' + nombre.split('__')[1]
                        actual['herramientas'][nombre] = actual['herramientas'].get(nombre, 0) + 1
                        e = b.get('input') or {}
                        ruta_a = e.get('file_path') or e.get('notebook_path')
                        if b.get('name') in ('Edit', 'Write', 'NotebookEdit', 'MultiEdit') and ruta_a and ruta_a not in actual['archivos']:
                            actual['archivos'].append(ruta_a)
                        if b.get('name') == 'Bash' and len(actual['comandos']) < 40:
                            actual['comandos'].append((e.get('description') or e.get('command') or '')[:160])
                        if b.get('name') in ('Agent', 'Task') and len(actual['comandos']) < 40:
                            actual['comandos'].append('agente: ' + (e.get('description') or '')[:140])
    for p in pasos:
        p['pedido'] = '\n— '.join(x for x in p['pedido'] if x)[:4000]
        p['respuesta'] = p['respuesta'][:3000]
    return meta, [p for p in pasos if p['id']]


# ── subir ───────────────────────────────────────────────────────────────────────

def _huella(p):
    return hashlib.sha1(json.dumps(p, sort_keys=True, default=str).encode()).hexdigest()[:16]


def subir(ruta, terminada=False, fin_turno=False):
    meta, pasos = leer_transcript(ruta)
    # Las sesiones lanzadas por programa (`claude -p`, bots, SDK) no son trabajo de Alex.
    if not pasos or (meta.get('entrypoint') or '').startswith('sdk'):
        return 0
    os.makedirs(os.path.join(CASA, 'estado'), exist_ok=True)
    ruta_estado = os.path.join(CASA, 'estado', meta['id'] + '.json')
    with open(ruta_estado + '.lock', 'w') as candado:
        fcntl.flock(candado, fcntl.LOCK_EX)
        try:
            estado = json.load(open(ruta_estado))
        except (OSError, ValueError):
            estado = {}
        nuevos = [p for p in pasos if estado.get(p['id']) != _huella(p)]
        firma_sesion = _huella([meta, len(pasos), terminada])
        if not nuevos and estado.get('_sesion') == firma_sesion and not fin_turno:
            return 0
        c = conexion()
        with c, c.cursor() as cur:
            cur.execute("""
              insert into hoy_cc_sesiones (id, owner_id, cwd, carpeta, titulo, inicio, ultimo, pasos, terminada)
              values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
              on conflict (id) do update set cwd = excluded.cwd, carpeta = excluded.carpeta,
                titulo = coalesce(nullif(excluded.titulo, ''), hoy_cc_sesiones.titulo),
                ultimo = excluded.ultimo, pasos = excluded.pasos,
                terminada = hoy_cc_sesiones.terminada or excluded.terminada,
                activo_desde = case when %s then null else hoy_cc_sesiones.activo_desde end, updated_at = now()
            """, (meta['id'], OWNER, meta['cwd'], '~' if meta['cwd'].rstrip('/') in ('', os.path.expanduser('~')) else os.path.basename(meta['cwd'].rstrip('/')),
                  meta['titulo'], pasos[0]['inicio'], pasos[-1]['fin'], len(pasos), terminada, fin_turno or terminada))
            for p in nuevos:
                # Si un paso ya procesado cambia (siguió creciendo), vuelve a la cola.
                cur.execute("""
                  insert into hoy_cc_pasos (id, owner_id, sesion_id, inicio, fin, pedido, respuesta, herramientas, archivos, comandos)
                  values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                  on conflict (id) do update set fin = excluded.fin, pedido = excluded.pedido,
                    respuesta = excluded.respuesta, herramientas = excluded.herramientas,
                    archivos = excluded.archivos, comandos = excluded.comandos,
                    procesado = hoy_cc_pasos.procesado and hoy_cc_pasos.fin = excluded.fin, updated_at = now()
                """, (p['id'], OWNER, meta['id'], p['inicio'], p['fin'], p['pedido'], p['respuesta'],
                      json.dumps(p['herramientas']), p['archivos'], p['comandos']))
        c.close()
        for p in nuevos:
            estado[p['id']] = _huella(p)
        estado['_sesion'] = firma_sesion
        json.dump(estado, open(ruta_estado, 'w'))
    log('subir', meta['id'][:8], f'{len(nuevos)} pasos', 'terminada' if terminada else '')
    return len(nuevos)


def transcripts_recientes(horas):
    limite = dt.datetime.now().timestamp() - horas * 3600
    return [r for r in glob.glob(os.path.join(PROYECTOS, '*', '*.jsonl')) if os.path.getmtime(r) >= limite]


# ── procesar: la IA divide los pasos en tareas ──────────────────────────────────

def esquema(categorias):
    """§14.5: proyecto, categoría y cuadrante siempre; las categorías son las de Alex."""
    clasif = {
        'proyecto_id': {'type': ['string', 'null'], 'description': 'id de PROYECTOS si encaja; null sólo si propones proyecto_nuevo.'},
        'proyecto_nuevo': {'type': ['string', 'null'], 'description': 'Nombre corto de un proyecto nuevo, sólo si no encaja en ninguno de PROYECTOS ni de la CHULETA.'},
        'categoria': {'type': 'string', 'enum': categorias},
        'cuadrante': {'type': 'string', 'enum': ['q1', 'q2', 'q3', 'q4'], 'description': 'Eisenhower: q1 urgente e importante · q2 importante no urgente · q3 urgente no importante · q4 ni una cosa ni otra.'},
    }
    e = json.loads(json.dumps(ESQUEMA_BASE))
    t = e['properties']['tareas']['items']
    t['properties'].pop('proyecto_id')
    t['properties'].pop('categoria')
    t['properties'].update(clasif)
    t['required'] = ['id', 'titulo', 'descripcion', 'proyecto_id', 'proyecto_nuevo', 'categoria', 'cuadrante', 'estado', 'pasos']
    pr = e['properties']['proximos']['items']
    pr['properties'].update(clasif)
    pr['required'] = ['id', 'titulo', 'descripcion', 'proyecto_id', 'proyecto_nuevo', 'categoria', 'cuadrante', 'dia', 'minutos']
    return e


ESQUEMA_BASE = {
    'type': 'object',
    'properties': {
        'resumen': {'type': 'string', 'description': '2-4 frases: qué se hizo en la sesión entera hasta ahora, con resultados concretos.'},
        'tareas': {'type': 'array', 'items': {
            'type': 'object',
            'properties': {
                'id': {'type': 'string', 'description': 'id de una tarea existente (de la sesión o abierta de Alex) si este trabajo ES esa tarea; "nueva" si no.'},
                'titulo': {'type': 'string', 'description': 'Como lo apuntaría Alex en su lista: verbo + objeto, ≤ 70 caracteres, en español.'},
                'descripcion': {'type': 'string', 'description': 'Qué se hizo y con qué resultado, 1-3 frases.'},
                'proyecto_id': {'type': ['string', 'null']},
                'categoria': {'type': 'string', 'enum': ['proyecto', 'soporte', 'contenido', 'ventas', 'ia', 'afiliados', 'general']},
                'estado': {'type': 'string', 'enum': ['revision', 'en_curso'], 'description': 'revision = Claude lo dio por terminado y espera el visto bueno de Alex; en_curso = sigue a medias.'},
                'pasos': {'type': 'array', 'items': {'type': 'string'}, 'description': 'ids de los pasos que forman esta tarea.'},
            },
            'required': ['id', 'titulo', 'descripcion', 'proyecto_id', 'categoria', 'estado', 'pasos'],
        }},
        'proximos': {'type': 'array', 'maxItems': 5, 'description': 'La lista COMPLETA y actualizada de próximos pasos propuestos de la sesión (§14.6).', 'items': {
            'type': 'object',
            'properties': {
                'id': {'type': 'string', 'description': 'id de un próximo PROPUESTO de PROXIMOS_DE_ESTA_SESION si es ese (actualizado); "nuevo" si no.'},
                'titulo': {'type': 'string', 'description': 'Acción concreta, verbo + objeto, ≤ 70 caracteres.'},
                'descripcion': {'type': 'string', 'description': 'Por qué y qué hay que hacer exactamente, 1-2 frases.'},
                'dia': {'type': 'string', 'description': 'AAAA-MM-DD, desde HOY, repartido según CARGA.'},
                'minutos': {'type': 'integer', 'description': 'Estimación: 15, 30, 60, 90, 120…'},
            },
        }},
    },
    'required': ['resumen', 'tareas', 'proximos'],
}

INSTRUCCIONES = """Eres el registrador de trabajo de Alex dentro de 2day, su app de tareas. Alex abre varias sesiones de Claude Code a la vez y al terminar no sabe qué hizo. Te llega una sesión: sus PASOS (cada paso = lo que Alex pidió y lo que Claude hizo hasta el siguiente pedido: herramientas, archivos tocados, comandos y la respuesta final).

Convierte los pasos en TAREAS como las que Alex apuntaría en su lista:
- Una tarea es un resultado reconocible («Desplegar la landing de Jonathan», «Arreglar el login del portal»), no una acción técnica suelta. Agrupa todos los pasos que trabajan en lo mismo, aunque no sean seguidos. Una sesión típica da 1-6 tareas.
- Cada paso va como mucho a UNA tarea. Los pasos sin resultado (saludos, /clear, preguntas sueltas, pruebas que no llevan a nada) no van a ninguna.
- Tú NUNCA das una tarea por completada: eso lo hace Alex. estado «revision» si la respuesta deja claro que Claude terminó su parte (hecho, desplegado, verificado, entregado) y toca que Alex lo revise. «en_curso» si se empezó y sigue a medias, esperando algo, o si Alex ha vuelto a pedir cambios sobre algo que estaba en revisión.
- Si el trabajo es una tarea que ya existe (TAREAS_DE_ESTA_SESION o TAREAS_DE_ALEX), usa su id en vez de «nueva»: así no se duplica y la tarea cambia de columna. Sé estricto: sólo si es claramente la misma. Una tarea con hecha=true ya la cerró Alex: si hay trabajo nuevo sobre ella, es una tarea «nueva».
- Clasifica SIEMPRE cada tarea y cada pendiente: proyecto, categoría y cuadrante.
  · Proyecto: usa la CHULETA (alias → proyecto) y PROYECTOS. Si el trabajo es de un CLIENTE de GrowthInfo (los «cliente:…» de PROYECTOS: Elena, Jonathan, Gemelos…), ese cliente, no «GrowthInfo». Si el proyecto de la chuleta existe en PROYECTOS, su id. Si la chuleta nombra un proyecto que aún no existe, o el trabajo no encaja en ninguno, proyecto_id null y proyecto_nuevo con un nombre corto (2-3 palabras, como los de PROYECTOS). No inventes proyectos por tarea ni por tema: un proyecto nuevo sólo para un cliente o negocio nuevo de verdad; un curso, lanzamiento o tema de un cliente va al proyecto de ese cliente.
  · Categoría: la que mejor describa el tipo de trabajo, de CATEGORIAS (clave → nombre).
  · Cuadrante: lo urgente es lo que tiene fecha o bloquea a alguien hoy; lo importante, lo que mueve dinero, clientes o el sistema.
- proximos: los PRÓXIMOS PASOS de esta sesión, que Alex validará uno a uno: lo que queda por hacer para cerrar lo que se trabajó (pruebas, despliegues, revisiones, decisiones pendientes, lo que Alex dijo que haría luego, lo bloqueado). Concretos y accionables, máximo 5, los más importantes primero. Devuelve la lista completa y actualizada: mantén (con su id) los PROPUESTOS que siguen valiendo, quita los que ya no, y NUNCA repitas uno aceptado o descartado ni una tarea que ya exista en TAREAS_DE_ALEX o TAREAS_DE_ESTA_SESION. Si no queda nada, lista vacía.
  · dia: reparte entre HOY y los próximos días mirando CARGA (tareas ya planificadas por día): lo urgente (q1) hoy o mañana; no pases de ~5 tareas en un día.
- Todo en español, sin humo. Responde sólo con el JSON."""


def _local(ts):
    return ts.astimezone() if ts.tzinfo else ts


def _dia_logico(ts):
    return (_local(ts) - dt.timedelta(hours=HORA_REINICIO)).date()


def _llamar_claude(entrada, schema, instrucciones=None, modelo=None):
    entorno = {k: v for k, v in os.environ.items() if k not in ('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN')}
    entorno['HOY_BITACORA_OFF'] = '1'
    os.makedirs(os.path.join(CASA, 'vacio'), exist_ok=True)
    r = subprocess.run(
        [CLAUDE, '-p', '--model', modelo or MODELO, '--output-format', 'json', '--json-schema', json.dumps(schema),
         '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--setting-sources', '',
         '--append-system-prompt', instrucciones or INSTRUCCIONES],
        input=json.dumps(entrada, ensure_ascii=False, default=str), capture_output=True, text=True,
        timeout=600, env=entorno, cwd=os.path.join(CASA, 'vacio'))
    if r.returncode != 0:
        raise RuntimeError(f'claude -p salió con {r.returncode}: {(r.stderr or r.stdout)[:500]}')
    sobre = json.loads(r.stdout)
    if sobre.get('is_error'):
        raise RuntimeError(f"claude -p: {str(sobre.get('result'))[:500]}")
    salida = sobre.get('structured_output')
    if salida is None:
        texto = (sobre.get('result') or '').strip().strip('`')
        salida = json.loads(texto[texto.find('{'):texto.rfind('}') + 1])
    return salida


def _toca(sesion, n_pendientes, ultimo_fin, ya):
    if ya or sesion['procesar_pedido'] or sesion['terminada']:
        return True
    if n_pendientes >= TANDA_MAX:
        return True
    return ultimo_fin < dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=QUIETA_MIN)


def procesar(sesion_id=None, ya=False):
    os.makedirs(os.path.join(CASA, 'candados'), exist_ok=True)
    c = conexion()
    cur = c.cursor()
    cur.execute("""
      select s.id, s.cwd, s.carpeta, s.titulo, s.resumen, s.terminada, s.procesar_pedido,
             count(p.id), max(p.fin)
      from hoy_cc_sesiones s join hoy_cc_pasos p on p.sesion_id = s.id and not p.procesado
      where s.owner_id = %s and (%s::text is null or s.id = %s)
      group by s.id order by max(p.fin)
    """, (OWNER, sesion_id, sesion_id))
    columnas = ['id', 'cwd', 'carpeta', 'titulo', 'resumen', 'terminada', 'procesar_pedido', 'n', 'ultimo_fin']
    sesiones = [dict(zip(columnas, f)) for f in cur.fetchall()]
    hechas = 0
    for s in sesiones:
        if not _toca(s, s['n'], s['ultimo_fin'], ya):
            continue
        # Un clasificador por SESIÓN (§14.0-5): dos a la vez sobre la misma duplicarían tareas;
        # cuatro terminales distintas sí van en paralelo. Ocupada → la recoge quien la tiene.
        candado = open(os.path.join(CASA, 'candados', s['id'] + '.lock'), 'w')
        try:
            fcntl.flock(candado, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            log('procesar: ocupada', s['id'][:8])
            continue
        try:
            hechas += _procesar_sesion(c, s)
        except Exception as e:  # una sesión rota no para las demás
            c.rollback()
            log('procesar ERROR', s['id'][:8], repr(e)[:400])
            print('ERROR', s['id'][:8], e, file=sys.stderr)
        finally:
            candado.close()
    c.close()
    return hechas


def _catalogos(cur):
    cur.execute("select id, nombre from hoy_proyectos where owner_id = %s and archivado_at is null order by posicion", (OWNER,))
    proyectos = [{'id': str(i), 'nombre': n} for i, n in cur.fetchall()]
    # §14.9: los clientes vivos de GrowthInfo también son «proyecto» (etiqueta en la tarea personal, no el portal).
    cur.execute("""select id, name from clients where scope = 'growthinfo' and archivado_at is null and deleted_at is null
                   order by name""")
    proyectos += [{'id': f'cliente:{i}', 'nombre': f'{n} (cliente de GrowthInfo)'} for i, n in cur.fetchall()]
    cur.execute("select clave, nombre from hoy_categorias where owner_id = %s and archivado_at is null order by posicion", (OWNER,))
    categorias = dict(cur.fetchall()) or {'general': 'General'}
    return proyectos, categorias


def _proyecto(cur, t, proyectos):
    """§14.5: el id elegido, o el proyecto nuevo (se reusa si ya existe con ese nombre; si no, se crea)."""
    if t.get('proyecto_id') in {p['id'] for p in proyectos}:
        return t['proyecto_id']
    nombre = (t.get('proyecto_nuevo') or '').strip()[:60]
    if not nombre:
        return None
    for p in proyectos:
        base = p['nombre'].replace(' (cliente de GrowthInfo)', '').strip().lower()
        if base == nombre.lower():
            return p['id']
    cur.execute("""insert into hoy_proyectos (owner_id, nombre, color, posicion)
                   values (%s, %s, %s, 200 + %s) returning id""", (OWNER, nombre, COLORES[len(proyectos) % len(COLORES)], len(proyectos)))
    nuevo = str(cur.fetchone()[0])
    proyectos.append({'id': nuevo, 'nombre': nombre})  # la siguiente tarea de la tanda ya lo ve
    log('proyecto nuevo', nombre)
    return nuevo


def partir(ref):
    """§14.9: lo que devuelve `_proyecto` → (proyecto_id, client_id). Un cliente va en client_id."""
    if ref and str(ref).startswith('cliente:'):
        return None, str(ref)[8:]
    return ref, None


def _procesar_sesion(c, s):
    cur = c.cursor()
    cur.execute("""select id, inicio, fin, pedido, respuesta, herramientas, archivos, comandos
                   from hoy_cc_pasos where sesion_id = %s and not procesado order by inicio limit %s""",
                (s['id'], PASOS_POR_LLAMADA))
    pasos = [dict(zip(['id', 'inicio', 'fin', 'pedido', 'respuesta', 'herramientas', 'archivos', 'comandos'], f)) for f in cur.fetchall()]
    if not pasos:
        return 0
    cur.execute("""select distinct t.id, t.titulo, t.hecha, t.estado from hoy_cc_pasos p join hoy_tareas t on t.id = p.tarea_id
                   where p.sesion_id = %s""", (s['id'],))
    de_la_sesion = [{'id': str(i), 'titulo': t, 'hecha': h, 'estado': e} for i, t, h, e in cur.fetchall()]
    # También las cerradas hace poco: si otra sesión (o Alex) ya la marcó hecha, se enlaza, no se duplica.
    cur.execute("""select t.id, t.titulo, coalesce(pr.nombre, ''), t.hecha from hoy_tareas t
                   left join hoy_proyectos pr on pr.id = t.proyecto_id
                   where t.owner_id = %s and t.archivado_at is null
                     and (not t.hecha or t.hecha_en > now() - interval '3 days')
                   order by t.updated_at desc limit 200""", (OWNER,))
    abiertas = [{'id': str(i), 'titulo': t, 'proyecto': p, 'hecha': h} for i, t, p, h in cur.fetchall()]
    proyectos, categorias = _catalogos(cur)
    cur.execute("""select id, titulo, estado, dia from hoy_proximos where sesion_id = %s order by orden""", (s['id'],))
    proximos = [{'id': str(i), 'titulo': t, 'estado': e, 'dia': str(d) if d else None} for i, t, e, d in cur.fetchall()]
    hoy = _dia_logico(dt.datetime.now().astimezone())
    cur.execute("""select k.hoy_para, count(*) from hoy_capa k join hoy_tareas t on t.id = k.tarea_id
                   where k.owner_id = %s and not t.hecha and t.archivado_at is null and k.hoy_para between %s and %s
                   group by 1""", (OWNER, hoy, hoy + dt.timedelta(days=10)))
    carga = {str(d): n for d, n in cur.fetchall()}

    entrada = {
        'SESION': {'carpeta': s['cwd'], 'titulo': s['titulo'], 'resumen_anterior': s['resumen']},
        'PASOS': [{'id': p['id'], 'hora': _local(p['inicio']).strftime('%d-%m %H:%M'),
                   'minutos': round((p['fin'] - p['inicio']).total_seconds() / 60),
                   'pedido': p['pedido'][:1500], 'respuesta': p['respuesta'][:1200],
                   'herramientas': p['herramientas'], 'archivos': [os.path.basename(a) for a in p['archivos']][:15],
                   'comandos': p['comandos'][:12]} for p in pasos],
        'TAREAS_DE_ESTA_SESION': de_la_sesion,
        'TAREAS_DE_ALEX': abiertas,
        'PROYECTOS': proyectos,
        'CATEGORIAS': categorias,
        'CHULETA': open(CHULETA).read() if os.path.exists(CHULETA) else '',
        'PROXIMOS_DE_ESTA_SESION': proximos,
        'HOY': str(hoy),
        'CARGA': {str(hoy + dt.timedelta(days=i)): carga.get(str(hoy + dt.timedelta(days=i)), 0) for i in range(11)},
    }
    salida = _llamar_claude(entrada, esquema(list(categorias)))

    por_id = {p['id']: p for p in pasos}
    validas = {t['id'] for t in de_la_sesion} | {t['id'] for t in abiertas}
    proyecto_de = lambda x: _proyecto(cur, x, proyectos)
    cur.execute("select id from hoy_pipelines where owner_id = %s order by created_at limit 1", (OWNER,))
    fila = cur.fetchone()
    pipeline = fila[0] if fila else None
    etapas = {}
    if pipeline:
        cur.execute("select clave, id from hoy_etapas where pipeline_id = %s", (pipeline,))
        etapas = dict(cur.fetchall())

    usados, creadas = set(), 0
    for t in salida.get('tareas', []):
        mis_pasos = [por_id[i] for i in t.get('pasos', []) if i in por_id and i not in usados]
        if not mis_pasos:
            continue
        usados.update(p['id'] for p in mis_pasos)
        # §14.4: la IA nunca completa. Terminada por Claude → revisión; a medias → en curso.
        estado = 'review' if t.get('estado') == 'revision' else 'in_progress'
        fin = max(p['fin'] for p in mis_pasos)
        proyecto = proyecto_de(t)
        categoria = t.get('categoria') if t.get('categoria') in categorias else None
        cuadrante = t.get('cuadrante') if t.get('cuadrante') in ('q1', 'q2', 'q3', 'q4') else None
        if t.get('id') in validas:
            tarea_id = t['id']
            # Una tarea que Alex ya completó no se reabre (sólo se le enlazan los pasos).
            cur.execute("""update hoy_tareas set estado = %s, etapa_id = coalesce(%s, etapa_id), updated_at = now()
                           where id = %s and not hecha""", (estado, etapas.get(estado), tarea_id))
            # Lo que Alex ya clasificó a mano no se toca: sólo se rellena lo que falte.
            pid, cid = partir(proyecto)
            cur.execute("""update hoy_tareas set proyecto_id = case when proyecto_id is null and client_id is null then %s else proyecto_id end,
                             client_id = case when proyecto_id is null and client_id is null then %s else client_id end,
                             categoria = coalesce(categoria, %s) where id = %s""", (pid, cid, categoria, tarea_id))
            cur.execute("""insert into hoy_capa (tarea_id, owner_id, origen, cuadrante) values (%s, %s, 'hoy', %s)
                           on conflict (tarea_id) do update set cuadrante = coalesce(hoy_capa.cuadrante, excluded.cuadrante)""",
                        (tarea_id, OWNER, cuadrante))
        else:
            cur.execute("""insert into hoy_tareas (owner_id, titulo, descripcion, proyecto_id, client_id, categoria, pipeline_id,
                             etapa_id, estado, inicio)
                           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
                        (OWNER, t['titulo'][:200], t.get('descripcion', ''), *partir(proyecto), categoria, pipeline,
                         etapas.get(estado), estado, _dia_logico(mis_pasos[0]['inicio'])))
            tarea_id = cur.fetchone()[0]
            cur.execute("""insert into hoy_capa (tarea_id, owner_id, origen, hoy_para, cuadrante, notas)
                           values (%s, %s, 'hoy', %s, %s, %s) on conflict (tarea_id) do nothing""",
                        (tarea_id, OWNER, _dia_logico(fin), cuadrante, f"Sacada de la sesión de Claude «{s['titulo'] or s['carpeta']}»"))
            creadas += 1
        cur.execute("update hoy_cc_pasos set tarea_id = %s where id = any(%s)", (tarea_id, [p['id'] for p in mis_pasos]))

    # §14.6: la lista de próximos PROPUESTOS de la sesión queda como la devuelve la IA (los decididos no se tocan).
    propuestos = {p['id'] for p in proximos if p['estado'] == 'propuesto'}
    seguidos = set()
    for orden, pr in enumerate(salida.get('proximos', [])[:5]):
        try:
            dia = max(dt.date.fromisoformat(pr.get('dia') or ''), hoy)
        except ValueError:
            dia = hoy
        valores = (pr['titulo'][:200], pr.get('descripcion', ''), *partir(proyecto_de(pr)),
                   pr.get('categoria') if pr.get('categoria') in categorias else None,
                   pr.get('cuadrante') if pr.get('cuadrante') in ('q1', 'q2', 'q3', 'q4') else None,
                   dia, pr.get('minutos'), orden)
        if pr.get('id') in propuestos:
            seguidos.add(pr['id'])
            cur.execute("""update hoy_proximos set titulo = %s, descripcion = %s, proyecto_id = %s, client_id = %s, categoria = %s, cuadrante = %s,
                             dia = %s, minutos = %s, orden = %s, updated_at = now() where id = %s""", (*valores, pr['id']))
        else:
            cur.execute("""insert into hoy_proximos (owner_id, sesion_id, titulo, descripcion, proyecto_id, client_id, categoria, cuadrante, dia, minutos, orden)
                           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""", (OWNER, s['id'], *valores))
    for quitado in propuestos - seguidos:
        cur.execute("delete from hoy_proximos where id = %s and estado = 'propuesto'", (quitado,))

    cur.execute("update hoy_cc_pasos set procesado = true, updated_at = now() where id = any(%s)", ([p['id'] for p in pasos],))
    cur.execute("""update hoy_cc_sesiones set resumen = %s, procesada_en = now(), procesar_pedido = false, updated_at = now()
                   where id = %s""", (salida.get('resumen') or s['resumen'], s['id']))
    c.commit()
    log('procesar', s['id'][:8], f'{len(pasos)} pasos → {len(salida.get("tareas", []))} tareas, {creadas} nuevas, {len(salida.get("proximos", []))} próximos')
    # Si quedan pasos (más de una llamada, u otro Stop llegó mientras se clasificaba), otra tanda.
    cur.execute("select count(*) from hoy_cc_pasos where sesion_id = %s and not procesado", (s['id'],))
    if cur.fetchone()[0]:
        s = dict(s, resumen=salida.get('resumen') or s['resumen'])
        return creadas + _procesar_sesion(c, s)
    return creadas


# ── reclasificar (§14.5): rellena proyecto, categoría y cuadrante a las que salieron sin ellos ──

def reclasificar():
    c = conexion()
    cur = c.cursor()
    cur.execute("""select t.id, t.titulo, t.descripcion, t.proyecto_id, t.categoria, k.cuadrante,
                          string_agg(distinct coalesce(nullif(s.titulo, ''), s.carpeta), ' · ')
                   from hoy_tareas t
                   join hoy_cc_pasos p on p.tarea_id = t.id join hoy_cc_sesiones s on s.id = p.sesion_id
                   left join hoy_capa k on k.tarea_id = t.id
                   where t.owner_id = %s and ((t.proyecto_id is null and t.client_id is null) or t.categoria is null or k.cuadrante is null)
                   group by t.id, k.cuadrante""", (OWNER,))
    faltan = [dict(zip(['id', 'titulo', 'descripcion', 'proyecto_id', 'categoria', 'cuadrante', 'sesion'], [str(f[0]), *f[1:]])) for f in cur.fetchall()]
    proyectos, categorias = _catalogos(cur)
    fila = esquema(list(categorias))['properties']['tareas']['items']
    item = {'type': 'object', 'properties': {'id': {'type': 'string'}, **{k: fila['properties'][k] for k in ('proyecto_id', 'proyecto_nuevo', 'categoria', 'cuadrante')}},
            'required': ['id', 'proyecto_id', 'proyecto_nuevo', 'categoria', 'cuadrante']}
    schema = {'type': 'object', 'properties': {'tareas': {'type': 'array', 'items': item}}, 'required': ['tareas']}
    hechas = 0
    for i in range(0, len(faltan), 40):
        tanda = faltan[i:i + 40]
        salida = _llamar_claude({
            'ENCARGO': 'Clasifica cada tarea de TAREAS (proyecto, categoría y cuadrante) con las mismas reglas. No cambies títulos.',
            'TAREAS': [{k: t[k] for k in ('id', 'titulo', 'descripcion', 'sesion')} for t in tanda],
            'PROYECTOS': proyectos, 'CATEGORIAS': categorias,
            'CHULETA': open(CHULETA).read() if os.path.exists(CHULETA) else '',
        }, schema)
        por_id = {t['id']: t for t in tanda}
        for r in salida.get('tareas', []):
            if r.get('id') not in por_id:
                continue
            pid, cid = partir(_proyecto(cur, r, proyectos))
            cur.execute("""update hoy_tareas set proyecto_id = case when proyecto_id is null and client_id is null then %s else proyecto_id end,
                             client_id = case when proyecto_id is null and client_id is null then %s else client_id end,
                             categoria = coalesce(categoria, %s) where id = %s""",
                        (pid, cid, r.get('categoria') if r.get('categoria') in categorias else None, r['id']))
            cur.execute("""insert into hoy_capa (tarea_id, owner_id, origen, cuadrante) values (%s, %s, 'hoy', %s)
                           on conflict (tarea_id) do update set cuadrante = coalesce(hoy_capa.cuadrante, excluded.cuadrante)""",
                        (r['id'], OWNER, r.get('cuadrante') if r.get('cuadrante') in ('q1', 'q2', 'q3', 'q4') else None))
            hechas += 1
        c.commit()
    c.close()
    log('reclasificar', f'{hechas} de {len(faltan)}')
    return hechas


# ── rearchivar (§14.9): lo que está en «GrowthInfo» (o sin proyecto y salió de Claude) → su cliente si lo tiene ──

def rearchivar():
    c = conexion()
    cur = c.cursor()
    cur.execute("select id from hoy_proyectos where owner_id = %s and nombre = 'GrowthInfo'", (OWNER,))
    gi = cur.fetchone()[0]
    cur.execute("""select 'tarea', t.id::text, t.titulo, t.descripcion, t.proyecto_id, t.client_id from hoy_tareas t
                   left join hoy_capa k on k.tarea_id = t.id
                   where t.owner_id = %s and t.archivado_at is null and t.client_id is null
                     and (t.proyecto_id = %s or (t.proyecto_id is null and (k.notas like 'Sacada de la sesión%%'
                          or k.notas like 'Próximo paso validado%%' or k.notas = 'Creada por Claude Code')))
                   union all
                   select 'proximo', id::text, titulo, descripcion, proyecto_id, client_id from hoy_proximos
                   where owner_id = %s and estado = 'propuesto' and client_id is null and (proyecto_id = %s or proyecto_id is null)
                   union all
                   select 'reunion', id, titulo, left(resumen, 600), proyecto_id, client_id from hoy_reuniones
                   where owner_id = %s and client_id is null and (proyecto_id = %s or proyecto_id is null)""",
                (OWNER, gi, OWNER, gi, OWNER, gi))
    items = [dict(zip(['tipo', 'id', 'titulo', 'descripcion', 'proyecto_id', 'client_id'], f)) for f in cur.fetchall()]
    respaldo = os.path.join(CASA, f"rearchivar-{dt.datetime.now():%Y%m%d-%H%M%S}.json")
    json.dump(items, open(respaldo, 'w'), default=str, ensure_ascii=False, indent=1)
    proyectos, _ = _catalogos(cur)
    ids = [p['id'] for p in proyectos]
    schema = {'type': 'object', 'properties': {'items': {'type': 'array', 'items': {'type': 'object', 'properties': {
        'id': {'type': 'string'}, 'destino': {'type': 'string', 'enum': ids + ['mantener']}}, 'required': ['id', 'destino']}}},
        'required': ['items']}
    tabla = {'tarea': 'hoy_tareas', 'proximo': 'hoy_proximos', 'reunion': 'hoy_reuniones'}
    cambios = 0
    for i in range(0, len(items), 60):
        tanda = items[i:i + 60]
        salida = _llamar_claude({
            'ENCARGO': ('Para cada elemento decide su destino: el id de un proyecto o cliente de PROYECTOS si claramente es suyo '
                        '(los «cliente:…» son clientes de GrowthInfo: si el elemento trata de ese cliente, va a él), o «mantener» '
                        'si se queda como está (trabajo general de GrowthInfo, o no está claro). Usa la CHULETA.'),
            'ELEMENTOS': [{k: t[k] for k in ('id', 'titulo', 'descripcion')} for t in tanda],
            'PROYECTOS': proyectos,
            'CHULETA': open(CHULETA).read() if os.path.exists(CHULETA) else '',
        }, schema)
        por_id = {t['id']: t for t in tanda}
        for r in salida.get('items', []):
            t = por_id.get(r.get('id'))
            if not t or r.get('destino') in (None, 'mantener') or r['destino'] == str(t['proyecto_id'] or ''):
                continue
            pid, cid = partir(r['destino'])
            cur.execute(f"update {tabla[t['tipo']]} set proyecto_id = %s, client_id = %s, updated_at = now() where id = %s",
                        (pid, cid, t['id']))
            cambios += 1
        c.commit()
    c.close()
    log('rearchivar', f'{cambios} de {len(items)} · respaldo {respaldo}')
    return cambios, len(items), respaldo


# ── hook ────────────────────────────────────────────────────────────────────────

def activo(sesion_id, cwd, pedido, tty=''):
    """§14.4: la terminal empieza a trabajar → tarjeta «Trabajando ahora» en el tablero."""
    carpeta = '~' if cwd.rstrip('/') in ('', os.path.expanduser('~')) else os.path.basename(cwd.rstrip('/'))
    c = conexion()
    with c, c.cursor() as cur:
        cur.execute("""
          insert into hoy_cc_sesiones (id, owner_id, cwd, carpeta, inicio, ultimo, activo_desde, activo_pedido, tty)
          values (%s, %s, %s, %s, now(), now(), now(), %s, %s)
          on conflict (id) do update set activo_desde = now(), activo_pedido = excluded.activo_pedido,
            tty = coalesce(nullif(excluded.tty, ''), hoy_cc_sesiones.tty), ultimo = now(), updated_at = now()
        """, (sesion_id, OWNER, cwd, carpeta, _limpiar_pedido(pedido)[:500], tty))
    c.close()


def hook():
    if os.environ.get('HOY_BITACORA_OFF'):
        return
    try:
        datos = json.load(sys.stdin)
    except ValueError:
        return
    evento = datos.get('hook_event_name')
    ruta = datos.get('transcript_path') or ''
    # Las sesiones de programa (`claude -p`, bots) no van al tablero.
    if os.environ.get('CLAUDE_CODE_ENTRYPOINT', 'cli').startswith('sdk'):
        return
    os.makedirs(CASA, exist_ok=True)
    entrada = None
    if evento == 'UserPromptSubmit':
        pedido = str(datos.get('prompt') or '')
        if _ruido(pedido) or _limpiar_pedido(pedido).split(' ')[0] in COMANDOS_RUIDO or not datos.get('session_id'):
            return
        # §14.8: la terminal de esta sesión (el widget salta a ella). El hook hereda el tty de Claude Code.
        try:
            tty = subprocess.run(['ps', '-o', 'tty=', '-p', str(os.getppid())], capture_output=True, text=True, timeout=2).stdout.strip()
        except Exception:
            tty = ''
        tty = '/dev/' + tty if tty and tty not in ('??', '?') and not tty.startswith('/dev/') else ''
        orden = [sys.executable, YO, 'activo', datos['session_id'], datos.get('cwd') or '', tty]
        entrada = pedido
    elif ruta and os.path.exists(ruta):
        orden = [sys.executable, YO, 'subir', ruta, '--fin-turno', '--procesar']
        if evento == 'SessionEnd':
            orden.append('--terminada')
    else:
        return
    # Suelto del hook: Claude Code no espera a la red ni a la IA.
    hijo = subprocess.Popen(orden, stdin=subprocess.PIPE if entrada else subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                            stderr=open(os.path.join(CASA, 'errores.log'), 'a'), start_new_session=True, text=True)
    if entrada:
        hijo.stdin.write(entrada)
        hijo.stdin.close()


def main(argv):
    if not argv:
        print(__doc__)
        return
    orden = argv[0]
    if orden == 'hook':
        hook()
    elif orden == 'subir':
        ruta = argv[1]
        try:
            subir(ruta, terminada='--terminada' in argv, fin_turno='--fin-turno' in argv)
        except Exception as e:
            log('subir ERROR', os.path.basename(ruta)[:8], repr(e)[:300])
            raise
        if '--procesar' in argv:
            procesar(os.path.basename(ruta)[:-6], ya=True)
    elif orden == 'activo':
        try:
            activo(argv[1], argv[2] if len(argv) > 2 else '', sys.stdin.read(), argv[3] if len(argv) > 3 else '')
        except Exception as e:
            log('activo ERROR', argv[1][:8], repr(e)[:300])
    elif orden == 'rearchivar':
        print('%s cambiados de %s · respaldo en %s' % rearchivar())
    elif orden == 'reclasificar':
        print(f'{reclasificar()} tareas clasificadas')
    elif orden == 'barrer':
        horas = float(argv[argv.index('--horas') + 1]) if '--horas' in argv else 6
        n = 0
        for ruta in transcripts_recientes(horas):
            try:
                n += subir(ruta)
            except Exception as e:
                log('barrer ERROR', os.path.basename(ruta)[:8], repr(e)[:300])
        print(f'{n} pasos subidos')
    elif orden == 'procesar':
        sid = argv[argv.index('--sesion') + 1] if '--sesion' in argv else None
        print(f'{procesar(sid, ya="--ya" in argv)} tareas nuevas')
    else:
        print(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])

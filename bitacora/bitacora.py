#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bitácora de Claude (LOGICA §14): las sesiones de Claude Code se apuntan solas en 2day.

  bitacora.py hook                    # Stop / SessionEnd de Claude Code (lee stdin, vuelve al instante)
  bitacora.py subir <transcript> [--terminada]
  bitacora.py barrer [--horas 6]      # relee los transcripts tocados en las últimas N horas
  bitacora.py procesar [--sesion ID] [--ya]   # la IA divide los pasos en tareas

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

QUIETA_MIN = 20       # §14.0-5
TANDA_MAX = 25
PASOS_POR_LLAMADA = 40
HORA_REINICIO = 4     # hoy_ajustes.hora_reinicio
MODELO = os.environ.get('BITACORA_MODELO', 'sonnet')


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


def subir(ruta, terminada=False):
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
        if not nuevos and estado.get('_sesion') == firma_sesion:
            return 0
        c = conexion()
        with c, c.cursor() as cur:
            cur.execute("""
              insert into hoy_cc_sesiones (id, owner_id, cwd, carpeta, titulo, inicio, ultimo, pasos, terminada)
              values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
              on conflict (id) do update set cwd = excluded.cwd, carpeta = excluded.carpeta,
                titulo = coalesce(nullif(excluded.titulo, ''), hoy_cc_sesiones.titulo),
                ultimo = excluded.ultimo, pasos = excluded.pasos,
                terminada = hoy_cc_sesiones.terminada or excluded.terminada, updated_at = now()
            """, (meta['id'], OWNER, meta['cwd'], '~' if meta['cwd'].rstrip('/') in ('', os.path.expanduser('~')) else os.path.basename(meta['cwd'].rstrip('/')),
                  meta['titulo'], pasos[0]['inicio'], pasos[-1]['fin'], len(pasos), terminada))
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

ESQUEMA = {
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
                'estado': {'type': 'string', 'enum': ['hecha', 'en_curso']},
                'pasos': {'type': 'array', 'items': {'type': 'string'}, 'description': 'ids de los pasos que forman esta tarea.'},
            },
            'required': ['id', 'titulo', 'descripcion', 'proyecto_id', 'categoria', 'estado', 'pasos'],
        }},
        'pendientes': {'type': 'array', 'maxItems': 3, 'items': {
            'type': 'object',
            'properties': {'titulo': {'type': 'string'}, 'descripcion': {'type': 'string'}, 'proyecto_id': {'type': ['string', 'null']}},
            'required': ['titulo', 'descripcion', 'proyecto_id'],
        }},
    },
    'required': ['resumen', 'tareas', 'pendientes'],
}

INSTRUCCIONES = """Eres el registrador de trabajo de Alex dentro de 2day, su app de tareas. Alex abre varias sesiones de Claude Code a la vez y al terminar no sabe qué hizo. Te llega una sesión: sus PASOS (cada paso = lo que Alex pidió y lo que Claude hizo hasta el siguiente pedido: herramientas, archivos tocados, comandos y la respuesta final).

Convierte los pasos en TAREAS como las que Alex apuntaría en su lista:
- Una tarea es un resultado reconocible («Desplegar la landing de Jonathan», «Arreglar el login del portal»), no una acción técnica suelta. Agrupa todos los pasos que trabajan en lo mismo, aunque no sean seguidos. Una sesión típica da 1-6 tareas.
- Cada paso va como mucho a UNA tarea. Los pasos sin resultado (saludos, /clear, preguntas sueltas, pruebas que no llevan a nada) no van a ninguna.
- estado «hecha» sólo si la respuesta deja claro que se terminó (hecho, desplegado, verificado, entregado). Si se empezó y quedó a medias o esperando algo, «en_curso».
- Si el trabajo es una tarea que ya existe (TAREAS_DE_ESTA_SESION o TAREAS_DE_ALEX, abiertas o cerradas hace poco), usa su id en vez de «nueva». Así no se duplica y, si quedó terminada, se marca hecha. Sé estricto: sólo si es claramente la misma.
- proyecto_id: uno de PROYECTOS si encaja claramente (por el tema o la carpeta), si no null.
- pendientes: sólo lo que Alex dijo explícitamente que haría luego o lo que quedó bloqueado y hay que retomar. Máximo 3. Si no hay, lista vacía.
- Todo en español, sin humo. Responde sólo con el JSON."""


def _local(ts):
    return ts.astimezone() if ts.tzinfo else ts


def _dia_logico(ts):
    return (_local(ts) - dt.timedelta(hours=HORA_REINICIO)).date()


def _llamar_claude(entrada):
    entorno = {k: v for k, v in os.environ.items() if k not in ('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN')}
    entorno['HOY_BITACORA_OFF'] = '1'
    os.makedirs(os.path.join(CASA, 'vacio'), exist_ok=True)
    r = subprocess.run(
        [CLAUDE, '-p', '--model', MODELO, '--output-format', 'json', '--json-schema', json.dumps(ESQUEMA),
         '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--setting-sources', '',
         '--append-system-prompt', INSTRUCCIONES],
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
    # Un solo clasificador a la vez (LaunchAgent y SessionEnd): dos a la vez duplicarían tareas.
    # Si está ocupado, el que llega se va; el LaunchAgent lo recoge en la siguiente vuelta.
    os.makedirs(CASA, exist_ok=True)
    candado = open(os.path.join(CASA, 'procesar.lock'), 'w')
    try:
        fcntl.flock(candado, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log('procesar: ocupado, lo recoge la siguiente vuelta')
        return 0
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
        try:
            hechas += _procesar_sesion(c, s)
        except Exception as e:  # una sesión rota no para las demás
            c.rollback()
            log('procesar ERROR', s['id'][:8], repr(e)[:400])
            print('ERROR', s['id'][:8], e, file=sys.stderr)
    c.close()
    return hechas


def _procesar_sesion(c, s):
    cur = c.cursor()
    cur.execute("""select id, inicio, fin, pedido, respuesta, herramientas, archivos, comandos
                   from hoy_cc_pasos where sesion_id = %s and not procesado order by inicio limit %s""",
                (s['id'], PASOS_POR_LLAMADA))
    pasos = [dict(zip(['id', 'inicio', 'fin', 'pedido', 'respuesta', 'herramientas', 'archivos', 'comandos'], f)) for f in cur.fetchall()]
    if not pasos:
        return 0
    cur.execute("""select distinct t.id, t.titulo, t.hecha from hoy_cc_pasos p join hoy_tareas t on t.id = p.tarea_id
                   where p.sesion_id = %s""", (s['id'],))
    de_la_sesion = [{'id': str(i), 'titulo': t, 'hecha': h} for i, t, h in cur.fetchall()]
    # También las cerradas hace poco: si otra sesión (o Alex) ya la marcó hecha, se enlaza, no se duplica.
    cur.execute("""select t.id, t.titulo, coalesce(pr.nombre, ''), t.hecha from hoy_tareas t
                   left join hoy_proyectos pr on pr.id = t.proyecto_id
                   where t.owner_id = %s and t.archivado_at is null
                     and (not t.hecha or t.hecha_en > now() - interval '3 days')
                   order by t.updated_at desc limit 200""", (OWNER,))
    abiertas = [{'id': str(i), 'titulo': t, 'proyecto': p, 'hecha': h} for i, t, p, h in cur.fetchall()]
    cur.execute("select id, nombre from hoy_proyectos where owner_id = %s and archivado_at is null", (OWNER,))
    proyectos = [{'id': str(i), 'nombre': n} for i, n in cur.fetchall()]

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
    }
    salida = _llamar_claude(entrada)

    por_id = {p['id']: p for p in pasos}
    validas = {t['id'] for t in de_la_sesion} | {t['id'] for t in abiertas}
    ids_proyecto = {p['id'] for p in proyectos}
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
        hecha = t.get('estado') == 'hecha'
        estado = 'done' if hecha else 'in_progress'
        fin = max(p['fin'] for p in mis_pasos)
        proyecto = t.get('proyecto_id') if t.get('proyecto_id') in ids_proyecto else None
        if t.get('id') in validas:
            tarea_id = t['id']
            if hecha:
                cur.execute("""update hoy_tareas set hecha = true, hecha_en = coalesce(hecha_en, %s), estado = 'done',
                               etapa_id = coalesce(%s, etapa_id), updated_at = now() where id = %s and not hecha""",
                            (fin, etapas.get('done'), tarea_id))
        else:
            cur.execute("""insert into hoy_tareas (owner_id, titulo, descripcion, proyecto_id, categoria, pipeline_id,
                             etapa_id, estado, hecha, hecha_en, inicio)
                           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
                        (OWNER, t['titulo'][:200], t.get('descripcion', ''), proyecto, t.get('categoria'), pipeline,
                         etapas.get(estado), estado, hecha, fin if hecha else None, _dia_logico(mis_pasos[0]['inicio'])))
            tarea_id = cur.fetchone()[0]
            cur.execute("""insert into hoy_capa (tarea_id, owner_id, origen, hoy_para, notas)
                           values (%s, %s, 'hoy', %s, %s) on conflict (tarea_id) do nothing""",
                        (tarea_id, OWNER, _dia_logico(fin), f"Sacada de la sesión de Claude «{s['titulo'] or s['carpeta']}»"))
            creadas += 1
        cur.execute("update hoy_cc_pasos set tarea_id = %s where id = any(%s)", (tarea_id, [p['id'] for p in mis_pasos]))

    for pe in salida.get('pendientes', [])[:3]:
        proyecto = pe.get('proyecto_id') if pe.get('proyecto_id') in ids_proyecto else None
        cur.execute("""insert into hoy_tareas (owner_id, titulo, descripcion, proyecto_id, pipeline_id, etapa_id, estado)
                       values (%s, %s, %s, %s, %s, %s, 'todo') returning id""",
                    (OWNER, pe['titulo'][:200], pe.get('descripcion', ''), proyecto, pipeline, etapas.get('todo')))
        cur.execute("insert into hoy_capa (tarea_id, owner_id, origen, notas) values (%s, %s, 'hoy', %s)",
                    (cur.fetchone()[0], OWNER, f"Pendiente que dejó la sesión de Claude «{s['titulo'] or s['carpeta']}»"))
        creadas += 1

    cur.execute("update hoy_cc_pasos set procesado = true, updated_at = now() where id = any(%s)", ([p['id'] for p in pasos],))
    cur.execute("""update hoy_cc_sesiones set resumen = %s, procesada_en = now(), procesar_pedido = false, updated_at = now()
                   where id = %s""", (salida.get('resumen') or s['resumen'], s['id']))
    c.commit()
    log('procesar', s['id'][:8], f'{len(pasos)} pasos → {len(salida.get("tareas", []))} tareas, {creadas} nuevas')
    # Si quedaban más pasos que una llamada, sigue con la siguiente tanda.
    if len(pasos) == PASOS_POR_LLAMADA:
        s = dict(s, resumen=salida.get('resumen') or s['resumen'])
        return creadas + _procesar_sesion(c, s)
    return creadas


# ── hook ────────────────────────────────────────────────────────────────────────

def hook():
    if os.environ.get('HOY_BITACORA_OFF'):
        return
    try:
        datos = json.load(sys.stdin)
    except ValueError:
        return
    ruta = datos.get('transcript_path')
    if not ruta or not os.path.exists(ruta):
        return
    evento = datos.get('hook_event_name')
    orden = [sys.executable, YO, 'subir', ruta]
    if evento == 'SessionEnd':
        orden += ['--terminada', '--procesar']
    os.makedirs(CASA, exist_ok=True)
    # Suelto del hook: Claude Code no espera a la red ni a la IA.
    subprocess.Popen(orden, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                     stderr=open(os.path.join(CASA, 'errores.log'), 'a'), start_new_session=True)


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
            subir(ruta, terminada='--terminada' in argv)
        except Exception as e:
            log('subir ERROR', os.path.basename(ruta)[:8], repr(e)[:300])
            raise
        if '--procesar' in argv:
            procesar(os.path.basename(ruta)[:-6], ya=True)
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

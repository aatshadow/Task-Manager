import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Moon, Scale, Pencil, Plus, X, Lock, Unlock } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Boton from '../../componentes/Boton.jsx'
import FilaTarea from '../Tareas/FilaTarea.jsx'
import { Lectura, HabitosDelDia, OtrosDelDia } from './Recap.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { usarCompletar } from '../../estado/usarGuardar.js'
import { marcar } from '../../datos/habitos.js'
import { guardarAjustes } from '../../datos/catalogos.js'
import { cargarEod, guardarEod, completadasDelDia, creadasDelDia, habitoEod } from '../../datos/eod.js'
import { aMinutos, textoFecha } from '../../datos/fechas.js'
import './eod.css'

/** Lo que falta hasta la hora de reinicio, que es cuando este EOD deja de ser el de hoy. */
function quedaHasta(reinicio, ahora) {
  let min = aMinutos(reinicio) - aMinutos(ahora)
  if (min <= 0) min += 24 * 60
  const h = Math.floor(min / 60)
  return h ? `${h} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`
}

/**
 * EOD (LOGICA §16): el cierre del día. La lectura IA (§16.3), sueño, peso y dientes (marcas de
 * sus hábitos), las preguntas de Alex y el recap: hábitos, reuniones, Claude, lo completado y lo
 * creado hoy, para tocar lo que haga falta. Vale para el día lógico: a la hora de reinicio (04:00) nace el de mañana.
 */
export default function Eod() {
  const { hoy, ahora, ajustes, setAjustes, habitos, marcas, setMarcas, tareas, avisar } = useDatos()
  const completar = usarCompletar()
  const [eod, setEod] = useState(null)
  const reinicio = ajustes?.horaReinicio || '04:00'

  // al cambiar el día (04:00) se carga el EOD nuevo, vacío
  useEffect(() => {
    let vivo = true
    setEod(null)
    cargarEod(hoy).then((e) => vivo && setEod(e)).catch((e) => { avisar(e.message, 'error'); if (vivo) setEod({ fecha: hoy, respuestas: {}, cerradoEn: null }) })
    return () => { vivo = false }
  }, [hoy, avisar])

  // mientras el Mac escribe la lectura, se relee cada 20 s
  const pedida = eod?.lecturaEstado === 'pedido'
  useEffect(() => {
    if (!pedida) return undefined
    const t = setInterval(() => cargarEod(hoy).then(setEod).catch(() => {}), 20000)
    return () => clearInterval(t)
  }, [pedida, hoy])

  const guardar = async (cambios) => {
    const anterior = eod
    setEod((e) => ({ ...e, ...cambios }))
    try { setEod(await guardarEod(hoy, cambios)) } catch (e) { setEod(anterior); avisar(e.message, 'error') }
  }

  /* ── hábitos: la misma marca que en Hoy y Hábitos ─────────────────────── */
  const marcasHoy = useMemo(() => (marcas || []).filter((m) => m.fecha === hoy), [marcas, hoy])
  const marcaDe = (h) => (h ? marcasHoy.find((m) => m.habitoId === h.id) || null : null)
  const cambiarMarca = async (h, si, extra = {}) => {
    const esEsta = (m) => m.habitoId === h.id && m.fecha === hoy
    const anterior = marcaDe(h)
    const optimista = { habitoId: h.id, fecha: hoy, nota: anterior?.nota || '', valor: extra.valor ?? null, marcadoEn: new Date().toISOString() }
    setMarcas((ms) => (si ? [...ms.filter((m) => !esEsta(m)), optimista] : ms.filter((m) => !esEsta(m))))
    try {
      const real = await marcar(h.id, hoy, si, { nota: optimista.nota, valor: optimista.valor })
      if (real) setMarcas((ms) => ms.map((m) => (esEsta(m) ? real : m)))
    } catch (e) {
      setMarcas((ms) => [...ms.filter((m) => !esEsta(m)), ...(anterior ? [anterior] : [])])
      avisar(e.message || 'No se pudo guardar', 'error')
    }
  }
  const sueno = habitoEod(habitos, 'sueno')
  const peso = habitoEod(habitos, 'peso')
  const dientes = habitoEod(habitos, 'dientes')

  const completadas = useMemo(() => completadasDelDia(tareas, hoy), [tareas, hoy])
  const creadas = useMemo(() => creadasDelDia(tareas, hoy), [tareas, hoy])
  const preguntas = ajustes?.eodPreguntas || []
  const cerrado = !!eod?.cerradoEn

  const guardarPreguntas = async (lista) => {
    const anterior = ajustes
    setAjustes((a) => ({ ...a, eodPreguntas: lista }))
    try { setAjustes(await guardarAjustes({ eodPreguntas: lista })) } catch (e) { setAjustes(anterior); avisar(e.message, 'error') }
  }

  return (
    <div className="pantalla eod">
      <Tarjeta variante={cerrado ? 'normal' : 'calida'} className="eod-cabeza">
        <div className="eod-cabeza-textos">
          <div className="eod-titulo">Cierre del {textoFecha(hoy, true)}</div>
          <div className="eod-sub">
            {cerrado
              ? `Cerrado a las ${new Date(eod.cerradoEn).toTimeString().slice(0, 5)} · editable hasta las ${reinicio}`
              : `Disponible hasta las ${reinicio} · quedan ${quedaHasta(reinicio, ahora)}`}
          </div>
        </div>
        {eod && (cerrado
          ? <Boton variante="secundario" pequeno icono={<Unlock size={16} />} onClick={() => guardar({ cerradoEn: null })}>Reabrir</Boton>
          : <Boton pequeno icono={<Lock size={16} />} onClick={() => guardar({ cerradoEn: new Date().toISOString(), lecturaEstado: 'pedido' })}>Cerrar el día</Boton>)}
      </Tarjeta>

      <Lectura eod={eod} alPedir={() => guardar({ lecturaEstado: 'pedido' })} />

      <section className="seccion">
        <div className="seccion-titulo">Cuerpo</div>
        <div className="eod-cuerpo">
          <Medida habito={sueno} marca={marcaDe(sueno)} icono={<Moon size={18} />} etiqueta="Sueño" unidad="h" alGuardar={cambiarMarca} />
          <Medida habito={peso} marca={marcaDe(peso)} icono={<Scale size={18} />} etiqueta="Peso" unidad="kg" alGuardar={cambiarMarca} />
          {dientes && (
            <button
              type="button"
              className={`eod-dientes${marcaDe(dientes) ? ' eod-dientes--hecho' : ''}`}
              aria-pressed={!!marcaDe(dientes)}
              onClick={() => cambiarMarca(dientes, !marcaDe(dientes))}
            >
              <span className="eod-dientes-marca">{marcaDe(dientes) && <Check size={16} strokeWidth={3} />}</span>
              <span className="eod-dientes-texto">🪥 Dientes lavados</span>
            </button>
          )}
        </div>
      </section>

      <Preguntas
        preguntas={preguntas}
        respuestas={eod?.respuestas || {}}
        listo={!!eod}
        alResponder={(p, texto) => guardar({ respuestas: { ...(eod?.respuestas || {}), [p]: texto } })}
        alCambiarPreguntas={guardarPreguntas}
      />

      <HabitosDelDia alMarcar={cambiarMarca} />
      <OtrosDelDia />

      <section className="seccion">
        <div className="seccion-titulo">Completadas hoy · {completadas.length}</div>
        {!completadas.length && <div className="eod-nada">Nada completado todavía</div>}
        <div className="eod-lista">
          {completadas.map((t) => <FilaTarea key={`${t.origen}-${t.id}`} tarea={t} conMarca alCompletar={(h) => completar(t, h)} />)}
        </div>
      </section>

      <section className="seccion">
        <div className="seccion-titulo">Creadas hoy · {creadas.length}</div>
        {!creadas.length && <div className="eod-nada">Hoy no se ha creado ninguna</div>}
        <div className="eod-lista">
          {creadas.map((t) => <FilaTarea key={`${t.origen}-${t.id}`} tarea={t} conMarca alCompletar={(h) => completar(t, h)} />)}
        </div>
      </section>
    </div>
  )
}

/** Un `medir` (sueño, peso): escribir y salir (o Enter) guarda; vaciarlo borra la marca. */
function Medida({ habito, marca, icono, etiqueta, unidad, alGuardar }) {
  const [valor, setValor] = useState(marca?.valor ?? '')
  useEffect(() => { setValor(marca?.valor ?? '') }, [marca?.valor])
  if (!habito) return null
  const guardar = () => {
    const v = String(valor).trim().replace(',', '.')
    if (v === '') { if (marca) alGuardar(habito, false); return }
    const n = Number(v)
    if (!Number.isFinite(n) || marca?.valor === n) return
    alGuardar(habito, true, { valor: n })
  }
  return (
    <label className={`eod-medida${marca?.valor != null ? ' eod-medida--hecha' : ''}`}>
      <span className="eod-medida-etiqueta">{icono}{etiqueta}</span>
      <span className="eod-medida-caja">
        <input
          inputMode="decimal"
          placeholder="—"
          value={String(valor).replace('.', ',')}
          onChange={(e) => setValor(e.target.value)}
          onBlur={guardar}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        <span className="eod-medida-unidad">{unidad}</span>
      </span>
    </label>
  )
}

/** Las preguntas: cada respuesta se guarda al salir del campo. «Editar» cambia las preguntas. */
function Preguntas({ preguntas, respuestas, listo, alResponder, alCambiarPreguntas }) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState(preguntas)
  useEffect(() => { if (!editando) setBorrador(preguntas) }, [preguntas, editando])

  const terminar = () => {
    const limpias = borrador.map((p) => p.trim()).filter(Boolean)
    if (JSON.stringify(limpias) !== JSON.stringify(preguntas)) alCambiarPreguntas(limpias)
    setEditando(false)
  }

  return (
    <section className="seccion">
      <div className="seccion-titulo eod-preguntas-titulo">
        Preguntas
        <button type="button" className="eod-editar" onClick={editando ? terminar : () => setEditando(true)}>
          {editando ? <><Check size={14} /> Listo</> : <><Pencil size={14} /> Editar</>}
        </button>
      </div>
      {editando ? (
        <div className="eod-editor">
          {borrador.map((p, i) => (
            <div key={i} className="eod-editor-fila">
              <input value={p} onChange={(e) => setBorrador((b) => b.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Pregunta" />
              <button type="button" aria-label="Quitar" onClick={() => setBorrador((b) => b.filter((_, j) => j !== i))}><X size={16} /></button>
            </div>
          ))}
          <Boton variante="fantasma" pequeno icono={<Plus size={16} />} onClick={() => setBorrador((b) => [...b, ''])}>Añadir pregunta</Boton>
        </div>
      ) : (
        <div className="eod-preguntas">
          {!preguntas.length && <div className="eod-nada">Sin preguntas: pulsa Editar para añadirlas</div>}
          {preguntas.map((p) => <Respuesta key={p} pregunta={p} texto={respuestas[p] || ''} listo={listo} alGuardar={(t) => alResponder(p, t)} />)}
        </div>
      )}
    </section>
  )
}

function Respuesta({ pregunta, texto, listo, alGuardar }) {
  const [valor, setValor] = useState(texto)
  const ref = useRef(null)
  useEffect(() => { if (document.activeElement !== ref.current) setValor(texto) }, [texto])
  // el textarea crece con lo escrito
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` } }, [valor])
  return (
    <label className="eod-pregunta">
      <span className="eod-pregunta-texto">{pregunta}</span>
      <textarea
        ref={ref}
        rows={2}
        value={valor}
        disabled={!listo}
        placeholder="Escribe…"
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => { if (valor.trim() !== texto.trim()) alGuardar(valor.trim()) }}
      />
    </label>
  )
}

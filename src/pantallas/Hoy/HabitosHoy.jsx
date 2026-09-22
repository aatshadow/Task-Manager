import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Dumbbell } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Marca from '../../componentes/Marca.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { agruparPorBloque, estaHecho, marcar, planDeHoy } from '../../datos/habitos.js'
import { colorBloque, nombreFase } from '../../datos/bloques.js'
import { aMinutos } from '../../datos/fechas.js'

/**
 * Los hábitos de hoy, agrupados por bloque del raíl (LOGICA §10.6): el bloque actual
 * primero y desplegado; los pasados plegados con «3/4»; los futuros plegados. Cada
 * hábito: icono, nombre, hora, marca. `evitar` con su estilo; `medir` con un campo
 * numérico (escribir el valor = marcar); un hábito con plan (Entreno) se despliega con
 * la sesión de hoy y admite una nota corta que va a `hoy_marcas.nota`.
 *
 * La marca se pinta al instante y se escribe después; si falla, se deshace y se avisa
 * (mismo patrón de siempre: la marca real sustituye a la optimista al volver).
 */
export default function HabitosHoy({ bloqueActualId = null }) {
  const { habitos, bloques, marcas, hoy, setMarcas, avisar, ahora } = useDatos()

  const grupos = useMemo(() => agruparPorBloque(habitos, bloques, hoy), [habitos, bloques, hoy])
  const marcasHoy = useMemo(() => (marcas || []).filter((m) => m.fecha === hoy), [marcas, hoy])

  // El actual arriba; el resto en el orden del raíl. Abiertos: el actual (o, sin actual, el primero).
  const ordenados = useMemo(() => {
    if (!bloqueActualId) return grupos
    const i = grupos.findIndex((g) => g.bloque?.id === bloqueActualId)
    return i > 0 ? [grupos[i], ...grupos.slice(0, i), ...grupos.slice(i + 1)] : grupos
  }, [grupos, bloqueActualId])
  const [abiertos, setAbiertos] = useState(() => new Set())
  useEffect(() => {
    // al cambiar el bloque actual se abre él y se pliega lo demás (una vez por cambio)
    setAbiertos(new Set([bloqueActualId || ordenados[0]?.bloque?.id || 'sueltos']))
  }, [bloqueActualId]) // eslint-disable-line react-hooks/exhaustive-deps
  const alternar = (clave) => setAbiertos((s) => { const n = new Set(s); n.has(clave) ? n.delete(clave) : n.add(clave); return n })

  if (!grupos.length) return null

  const cambiar = async (h, si, extra) => {
    const esEsta = (m) => m.habitoId === h.id && m.fecha === hoy
    const marcaAnterior = (marcas || []).find(esEsta) || null
    const optimista = { habitoId: h.id, fecha: hoy, nota: extra?.nota ?? marcaAnterior?.nota ?? '', valor: extra?.valor ?? marcaAnterior?.valor ?? null, marcadoEn: new Date().toISOString() }
    setMarcas((ms) => si ? [...ms.filter((m) => !esEsta(m)), optimista] : ms.filter((m) => !esEsta(m)))
    try {
      const real = await marcar(h.id, hoy, si, { nota: optimista.nota, valor: optimista.valor })
      if (real) setMarcas((ms) => ms.map((m) => (esEsta(m) ? real : m)))
    } catch (e) {
      setMarcas((ms) => {
        const sinEsta = ms.filter((m) => !esEsta(m))
        return marcaAnterior ? [...sinEsta, marcaAnterior] : sinEsta
      })
      avisar(e.message || 'No se pudo marcar el hábito', 'error')
    }
  }

  const minutosAhora = aMinutos(ahora)

  return (
    <section className="seccion habitos-bloques">
      <div className="seccion-titulo">Hábitos de hoy</div>
      {ordenados.map(({ bloque, habitos: hs }) => {
        const clave = bloque?.id || 'sueltos'
        const hechos = hs.filter((h) => estaHecho(h, marcasHoy, hoy)).length
        const esActual = bloque && bloque.id === bloqueActualId
        const pasado = bloque && !esActual && aMinutos(bloque.fin) <= minutosAhora && aMinutos(bloque.fin) > aMinutos(bloque.inicio)
        const abierto = abiertos.has(clave)
        const color = bloque ? colorBloque(bloque) : 'var(--texto-3)'
        return (
          <Tarjeta key={clave} className={`hb${esActual ? ' hb--actual' : ''}${pasado ? ' hb--pasado' : ''}${hechos === hs.length ? ' hb--completo' : ''}`} style={{ '--bloque-color': color }}>
            <button type="button" className="hb-cabeza" onClick={() => alternar(clave)} aria-expanded={abierto}>
              <span className="hb-barra" aria-hidden="true" />
              <span className="hb-textos">
                <span className="hb-nombre">{bloque ? bloque.nombre : 'Sin bloque'}</span>
                <span className="hb-meta">{bloque ? `${bloque.inicio} – ${bloque.fin} · ${nombreFase(bloque.fase)}` : 'hábitos sin hora en el raíl'}{esActual ? ' · ahora' : ''}</span>
              </span>
              <span className={`hb-cuenta${hechos === hs.length ? ' hb-cuenta--completo' : ''}`}>{hechos}/{hs.length}</span>
              <motion.span className="hb-flecha" animate={{ rotate: abierto ? 180 : 0 }} transition={{ duration: 0.18 }}><ChevronDown size={18} strokeWidth={1.75} /></motion.span>
            </button>
            <AnimatePresence initial={false}>
              {abierto && (
                <motion.div
                  key="cuerpo"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="hb-lista">
                    {hs.map((h) => (
                      <FilaHabito key={h.id} habito={h} marca={marcasHoy.find((m) => m.habitoId === h.id) || null} hoy={hoy} alCambiar={(si, extra) => cambiar(h, si, extra)} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Tarjeta>
        )
      })}
    </section>
  )
}

/**
 * Una fila de hábito. `hacer`: marca. `evitar`: marca con estilo de «resistido». `medir`:
 * campo numérico; escribir un valor y salir (o Enter) marca; borrarlo desmarca. Con plan
 * de hoy (Entreno): se despliega con la sesión y una nota que se guarda con la marca
 * (anotar pesos ya es haber entrenado: la nota marca hecho).
 */
function FilaHabito({ habito: h, marca, hoy, alCambiar }) {
  const hecho = estaHecho(h, marca ? [marca] : [], hoy)
  const plan = useMemo(() => planDeHoy(h, hoy), [h, hoy])
  const [abierto, setAbierto] = useState(false)
  const [valor, setValor] = useState(marca?.valor ?? '')
  const [nota, setNota] = useState(marca?.nota ?? '')
  useEffect(() => { setValor(marca?.valor ?? '') }, [marca?.valor])
  useEffect(() => { setNota(marca?.nota ?? '') }, [marca?.nota])

  const guardarValor = () => {
    const v = String(valor).trim().replace(',', '.')
    if (v === '') { if (marca) alCambiar(false); return }
    const n = Number(v)
    if (!Number.isFinite(n)) return
    if (marca?.valor === n) return
    alCambiar(true, { valor: n })
  }
  const guardarNota = () => {
    const n = String(nota).trim()
    if ((marca?.nota || '') === n && (marca || !n)) return
    alCambiar(true, { nota: n })
  }

  const clases = ['hb-fila', `hb-fila--${h.tipo || 'hacer'}`, hecho && 'hb-fila--hecho', plan && 'hb-fila--plan'].filter(Boolean).join(' ')
  return (
    <div className={clases} style={{ '--habito-color': h.color }}>
      <div className="hb-fila-linea" onClick={plan ? () => setAbierto((a) => !a) : undefined} role={plan ? 'button' : undefined}>
        <span className="hb-fila-icono" aria-hidden="true">{h.icono || (plan ? <Dumbbell size={16} strokeWidth={1.75} /> : '•')}</span>
        <span className="hb-fila-textos">
          <span className="hb-fila-nombre">{h.nombre}</span>
          <span className="hb-fila-meta">
            {h.hora && <span className="hb-fila-hora">{h.hora}</span>}
            {h.tipo === 'evitar' && <span className="hb-fila-tipo">evitar</span>}
            {plan && <span className="hb-fila-plan-titulo">{plan.titulo}</span>}
          </span>
        </span>
        {h.tipo === 'medir' ? (
          <label className="hb-medir" onClick={(e) => e.stopPropagation()}>
            <input
              className="hb-medir-campo"
              type="text"
              inputMode="decimal"
              placeholder={h.objetivo != null ? String(h.objetivo) : '—'}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onBlur={guardarValor}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              aria-label={`${h.nombre} en ${h.unidad || 'unidades'}`}
            />
            <span className="hb-medir-unidad">{h.unidad}</span>
          </label>
        ) : (
          <Marca hecha={hecho} color={h.color} alCambiar={(si) => alCambiar(si)} aria-label={h.nombre} />
        )}
      </div>

      {plan && (
        <AnimatePresence initial={false}>
          {abierto && (
            <motion.div key="plan" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
              <div className="hb-plan">
                <ul className="hb-plan-lineas">
                  {plan.lineas.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
                <input
                  className="hb-plan-nota"
                  type="text"
                  placeholder="Nota: pesos, rondas…"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  onBlur={guardarNota}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  aria-label={`Nota de ${h.nombre}`}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  )
}

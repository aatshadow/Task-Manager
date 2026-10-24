import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, MoonStar } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Boton from '../../componentes/Boton.jsx'
import { Lectura } from './Recap.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { adherencia } from '../../datos/habitos.js'
import { cargarEod, guardarEod, habitoEod } from '../../datos/eod.js'
import './eod.css'

const coma = (n) => String(n).replace('.', ',')

/**
 * El EOD de un día en el Calendario (LOGICA §16.4): una línea con lo esencial (nota de la
 * lectura, sueño, peso, dientes, hábitos) que se despliega con las respuestas y la lectura
 * entera. De sólo lectura; el de hoy se edita en la pestaña EOD. Los días futuros no tienen.
 */
export default function EodDelDia({ fecha, alAbrirEod }) {
  const { hoy, habitos, marcas, avisar } = useDatos()
  const [eod, setEod] = useState(null)
  const [abierto, setAbierto] = useState(false)
  const futuro = fecha > hoy

  useEffect(() => {
    if (futuro) return undefined
    let vivo = true
    setEod(null)
    cargarEod(fecha).then((e) => vivo && setEod(e)).catch(() => {})
    return () => { vivo = false }
  }, [fecha, futuro])
  // la lectura pedida se relee hasta que llega
  const pedida = eod?.lecturaEstado === 'pedido'
  useEffect(() => {
    if (!pedida) return undefined
    const t = setInterval(() => cargarEod(fecha).then(setEod).catch(() => {}), 20000)
    return () => clearInterval(t)
  }, [pedida, fecha])

  const valor = (cual) => {
    const h = habitoEod(habitos, cual)
    const m = h && (marcas || []).find((x) => x.habitoId === h.id && x.fecha === fecha)
    return m ? (h.tipo === 'medir' ? m.valor : true) : null
  }
  const a = useMemo(() => adherencia(habitos, marcas, fecha), [habitos, marcas, fecha])
  if (futuro || !eod) return null

  const sueno = valor('sueno')
  const peso = valor('peso')
  const dientes = valor('dientes')
  const respuestas = Object.entries(eod.respuestas || {}).filter(([, t]) => String(t).trim())
  const vacio = !respuestas.length && !eod.lectura && sueno == null && peso == null && !dientes && !a.hechos
  const pedir = async () => {
    setEod((e) => ({ ...e, lecturaEstado: 'pedido' }))
    try { setEod(await guardarEod(fecha, { lecturaEstado: 'pedido' })) } catch (e) { avisar(e.message, 'error') }
  }

  return (
    <Tarjeta compacta className="eod-dia">
      <button type="button" className="eod-dia-cabeza" onClick={() => setAbierto((x) => !x)} aria-expanded={abierto}>
        <MoonStar size={16} className="eod-dia-icono" />
        <span className="eod-dia-titulo">EOD{eod.cerradoEn ? ' · cerrado' : ''}</span>
        <span className="eod-dia-datos">
          {vacio && <span>sin rellenar</span>}
          {eod.lectura?.nota != null && <b>{coma(eod.lectura.nota)}/10</b>}
          {sueno != null && <span>😴 {coma(sueno)} h</span>}
          {peso != null && <span>⚖️ {coma(peso)} kg</span>}
          {dientes && <span>🪥</span>}
          {a.tocaban > 0 && <span>hábitos {a.hechos}/{a.tocaban}</span>}
        </span>
        <motion.span className="eod-dia-flecha" animate={{ rotate: abierto ? 180 : 0 }} transition={{ duration: 0.18 }}><ChevronDown size={16} /></motion.span>
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
            <div className="eod-dia-cuerpo">
              {respuestas.map(([p, t]) => (
                <div key={p} className="eod-parte"><div className="eod-parte-titulo">{p}</div><p>{t}</p></div>
              ))}
              {!respuestas.length && <div className="eod-nada">No hay respuestas de este día</div>}
              <Lectura eod={eod} alPedir={pedir} />
              {fecha === hoy && alAbrirEod && <Boton variante="secundario" pequeno onClick={alAbrirEod}>Abrir el EOD de hoy</Boton>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Tarjeta>
  )
}

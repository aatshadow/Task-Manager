import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Settings } from 'lucide-react'
import { ESPACIOS, espacioDe } from './Nav.jsx'

/**
 * El dock de vidrio y el menú radial (LOGICA §18). Sustituye en móvil a la barra de
 * pestañas y al FAB. Abajo: el espacio actual (toque → Día) · el botón de tres rayas · «+».
 *
 * El botón central abre el menú: un arco con los cinco espacios (§18.1) y Ajustes. Se puede
 * tocar uno, o MANTENER el botón y deslizar hasta él y soltar: el que queda bajo el dedo se
 * enciende y su nombre sale grande arriba. Escape o tocar fuera cierra.
 */
const AJUSTES = { clave: 'ajustes', etiqueta: 'Ajustes', Icono: Settings, lema: 'cómo funciona 2day.' }
const UMBRAL_ARRASTRE = 12 // px: por debajo, fue un toque y el menú se queda abierto
const RADIO_CAPTURA = 44   // px alrededor de un botón para «estar encima»

// los ángulos van de izquierda (180°) a derecha (0°), dejando aire en los extremos
function arco(items, radio, desde, hasta) {
  const n = items.length
  return items.map((it, i) => {
    const ang = (n === 1 ? (desde + hasta) / 2 : desde - (desde - hasta) * i / (n - 1)) * Math.PI / 180
    return { ...it, x: Math.cos(ang) * radio, y: -Math.sin(ang) * radio }
  })
}

function geometria(ancho) {
  const exterior = Math.min(150, (Math.min(ancho, 430) / 2 - 34) / Math.cos(15 * Math.PI / 180))
  // el arco de dentro es sólo luz: marca el centro, no lleva botones
  return { exterior, interior: exterior * 0.52, items: arco([...ESPACIOS, AJUSTES], exterior, 160, 20) }
}

export default function MenuRadial({ activa, alEspacio, alNueva, alAjustes }) {
  const [abierto, setAbierto] = useState(false)
  const [encima, setEncima] = useState(null)
  const [geo, setGeo] = useState(() => geometria(typeof window === 'undefined' ? 390 : window.innerWidth))
  const centro = useRef(null)
  const gesto = useRef(null) // { x, y, movido } mientras el dedo sigue abajo tras abrir
  const abriendo = useRef(false) // el click que sigue al pointerdown que abrió no debe cerrar

  useEffect(() => {
    const alRedimensionar = () => setGeo(geometria(window.innerWidth))
    window.addEventListener('resize', alRedimensionar)
    return () => window.removeEventListener('resize', alRedimensionar)
  }, [])

  const cerrar = useCallback(() => { setAbierto(false); setEncima(null); gesto.current = null }, [])

  const ir = useCallback((clave) => {
    cerrar()
    if (clave === 'ajustes') alAjustes?.()
    else alEspacio?.(clave)
  }, [cerrar, alEspacio, alAjustes])

  // qué sección queda bajo el punto (coordenadas de pantalla)
  const bajo = useCallback((px, py) => {
    const c = centro.current?.getBoundingClientRect()
    if (!c) return null
    const cx = c.left + c.width / 2
    const cy = c.top + c.height / 2
    let mejor = null
    let dist = RADIO_CAPTURA
    for (const it of geo.items) {
      const d = Math.hypot(px - (cx + it.x), py - (cy + it.y))
      if (d < dist) { dist = d; mejor = it.clave }
    }
    return mejor
  }, [geo])

  // mantener y deslizar: se sigue al dedo por toda la ventana hasta que se levanta
  useEffect(() => {
    if (!abierto) return undefined
    const mover = (e) => {
      const g = gesto.current
      if (!g) return
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > UMBRAL_ARRASTRE) g.movido = true
      const clave = bajo(e.clientX, e.clientY)
      setEncima(prev => {
        if (prev !== clave && clave) navigator.vibrate?.(6)
        return clave
      })
    }
    const soltar = (e) => {
      const g = gesto.current
      gesto.current = null
      if (!g?.movido) return // fue un toque: el menú se queda abierto para tocar
      const clave = bajo(e.clientX, e.clientY)
      if (clave) ir(clave)
      else setEncima(null)
    }
    const tecla = (e) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
    window.addEventListener('keydown', tecla)
    const scroll = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
      window.removeEventListener('keydown', tecla)
      document.body.style.overflow = scroll
    }
  }, [abierto, bajo, ir, cerrar])

  const alBajarCentro = (e) => {
    if (abierto) return // con el menú abierto, el toque en el centro lo cierra (onClick)
    e.preventDefault()
    gesto.current = { x: e.clientX, y: e.clientY, movido: false }
    abriendo.current = true
    setAbierto(true)
    navigator.vibrate?.(8)
  }
  const alClicCentro = () => {
    if (abriendo.current) { abriendo.current = false; return }
    if (abierto) cerrar()
    else setAbierto(true) // con teclado (Enter/Espacio) no hay pointerdown
  }

  const espacio = espacioDe(activa)
  const actualClave = espacio?.clave || (activa ? null : 'ajustes')
  const actual = espacio || AJUSTES
  const IconoActual = actual.Icono
  const titulo = [...ESPACIOS, AJUSTES].find(p => p.clave === (encima || actualClave))

  return (
    <>
      <AnimatePresence>
        {abierto && (
          <motion.div
            className="radial-fondo"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={cerrar}
          >
            <div className="radial-titulo" style={{ bottom: `calc(var(--safe-abajo) + 52px + ${geo.exterior + 78}px)` }}>
              <span className="radial-titulo-pre">{encima ? 'Ir a' : 'Estás en'}</span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={titulo?.clave || 'nada'}
                  className="radial-titulo-nombre"
                  initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
                  transition={{ duration: 0.18 }}
                >
                  {titulo?.etiqueta || ''}
                  {titulo?.lema && <span className="radial-titulo-lema">{titulo.lema}</span>}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="dock-zona">
        <div className={`dock${abierto ? ' dock--abierto' : ''}`}>
          <AnimatePresence>
            {abierto && (
              <div className="radial-ancla" onClick={e => e.stopPropagation()}>
                {/* los dos arcos de luz por donde corren los botones */}
                <motion.svg
                  className="radial-arcos"
                  width={geo.exterior * 2 + 60}
                  height={geo.exterior + 40}
                  viewBox={`${-geo.exterior - 30} ${-geo.exterior - 30} ${geo.exterior * 2 + 60} ${geo.exterior + 40}`}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                >
                  <defs>
                    <linearGradient id="radial-oro" x1="0" x2="1">
                      <stop offset="0" stopColor="rgba(255, 255, 255,0)" />
                      <stop offset="0.5" stopColor="rgba(255, 255, 255,0.55)" />
                      <stop offset="1" stopColor="rgba(255, 255, 255,0)" />
                    </linearGradient>
                  </defs>
                  {[geo.interior, geo.exterior].map(r => (
                    <path key={r} d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`} fill="none" stroke="url(#radial-oro)" strokeWidth="1" />
                  ))}
                </motion.svg>

                {geo.items.map((it, i) => {
                  const { Icono } = it
                  const esActiva = it.clave === actualClave
                  const esEncima = it.clave === encima
                  return (
                    <motion.button
                      key={it.clave}
                      type="button"
                      className={`radial-item${esActiva ? ' radial-item--activa' : ''}${esEncima ? ' radial-item--encima' : ''}`}
                      aria-label={it.etiqueta}
                      aria-current={esActiva ? 'page' : undefined}
                      initial={{ x: 0, y: 0, scale: 0.2, opacity: 0, rotate: -40 }}
                      animate={{ x: it.x, y: it.y, scale: esEncima ? 1.18 : 1, opacity: 1, rotate: 0 }}
                      exit={{ x: 0, y: 0, scale: 0.2, opacity: 0, transition: { duration: 0.16, delay: (geo.items.length - i) * 0.012 } }}
                      transition={{ type: 'spring', stiffness: 420, damping: 28, delay: i * 0.025 }}
                      onPointerEnter={() => setEncima(it.clave)}
                      onPointerLeave={() => setEncima(prev => (prev === it.clave && !gesto.current ? null : prev))}
                      onClick={() => ir(it.clave)}
                    >
                      <span className="radial-item-disco"><Icono size={21} strokeWidth={1.6} /></span>
                      <span className="radial-item-nombre">{it.etiqueta}</span>
                    </motion.button>
                  )
                })}
              </div>
            )}
          </AnimatePresence>

          <button type="button" className="dock-lado" onClick={() => alEspacio?.('dia')} aria-label={`Estás en ${actual.etiqueta}; ir a Día`}>
            <IconoActual size={20} strokeWidth={1.7} />
            <span>{actual.etiqueta}</span>
          </button>

          <motion.button
            ref={centro}
            type="button"
            className={`dock-centro${abierto ? ' dock-centro--abierto' : ''}`}
            aria-label={abierto ? 'Cerrar el menú' : 'Abrir el menú'}
            aria-expanded={abierto}
            onPointerDown={alBajarCentro}
            onClick={alClicCentro}
            whileTap={{ scale: 0.92 }}
          >
            <span className="dock-rayas" aria-hidden="true"><i /><i /><i /></span>
          </motion.button>

          <button type="button" className="dock-lado" onClick={alNueva} aria-label="Nueva tarea">
            <Plus size={20} strokeWidth={1.8} />
            <span>Nueva</span>
          </button>
        </div>
      </div>
    </>
  )
}

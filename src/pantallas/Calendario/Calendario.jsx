import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import './calendario.css'
import Segmentos from '../../componentes/Segmentos.jsx'
import CabeceraPeriodo from './CabeceraPeriodo.jsx'
import VistaDia from './VistaDia.jsx'
import VistaSemana from './VistaSemana.jsx'
import VistaMes from './VistaMes.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { deISO, mesDe, nombreDia, nombreMes, semanaDe, sumarDias, sumarMeses, textoFecha } from '../../datos/fechas.js'

const VISTAS = [
  { valor: 'dia', etiqueta: 'Día' },
  { valor: 'semana', etiqueta: 'Semana' },
  { valor: 'mes', etiqueta: 'Mes' },
]
const CLAVE_VISTA = 'hoy:calendario:vista'
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const mesCorto = (iso) => capital(nombreMes(iso).slice(0, 3))

/** Cómo se lee cada período en la cabecera: el centro y sus dos vecinos. */
function etiquetas(vista, fecha, hoy) {
  const anioActual = deISO(hoy).getFullYear()
  const conAnio = (iso, texto) => (deISO(iso).getFullYear() === anioActual ? texto : `${texto} ${deISO(iso).getFullYear()}`)
  if (vista === 'mes') {
    return {
      anterior: mesCorto(sumarMeses(fecha, -1)),
      titulo: conAnio(fecha, capital(nombreMes(fecha))),
      siguiente: mesCorto(sumarMeses(fecha, 1)),
    }
  }
  if (vista === 'semana') {
    // «14 – 20 sep», o «28 sep – 4 oct» si la semana cruza de mes; los lados sólo con números
    const tramo = (f, conMes) => {
      const [l, , , , , , d] = semanaDe(f)
      const dl = deISO(l).getDate()
      const dd = deISO(d).getDate()
      if (!conMes) return `${dl} – ${dd}`
      const ml = nombreMes(l).slice(0, 3)
      const md = nombreMes(d).slice(0, 3)
      return ml === md ? `${dl} – ${dd} ${ml}` : `${dl} ${ml} – ${dd} ${md}`
    }
    return {
      anterior: tramo(sumarDias(fecha, -7), false),
      titulo: conAnio(fecha, tramo(fecha, true)),
      siguiente: tramo(sumarDias(fecha, 7), false),
    }
  }
  const corto = (f) => `${nombreDia(f, true)} ${deISO(f).getDate()}`
  return {
    anterior: corto(sumarDias(fecha, -1)),
    titulo: fecha === hoy ? `Hoy, ${textoFecha(fecha)}` : conAnio(fecha, `${capital(nombreDia(fecha))} ${textoFecha(fecha)}`),
    siguiente: corto(sumarDias(fecha, 1)),
  }
}

/**
 * Calendario (LOGICA §5): sólo tareas, por `vence`. Tres vistas con el mismo esqueleto:
 * segmentos arriba, cabecera de período con flechas, y la vista. La fecha elegida es una
 * sola para las tres: cambiar de vista no te pierde el día que estabas mirando.
 */
export default function Calendario() {
  const { tareas, hoy, nuevaTarea, cargando, error } = useDatos()
  const [vista, setVista] = useState(() => {
    try { return VISTAS.some((v) => v.valor === localStorage.getItem(CLAVE_VISTA)) ? localStorage.getItem(CLAVE_VISTA) : 'mes' }
    catch { return 'mes' }
  })
  const [fecha, setFecha] = useState(hoy)
  const [direccion, setDireccion] = useState(1)

  useEffect(() => { try { localStorage.setItem(CLAVE_VISTA, vista) } catch { /* sin almacenamiento, sin memoria: no pasa nada */ } }, [vista])

  // Si `hoy` cambia con la pantalla abierta (reinicio a las 04:00, o los ajustes traen otra
  // hora de reinicio después del montaje) y no se había navegado, el calendario se va con él:
  // si no, se quedaría en el día viejo con el botón «Hoy» encendido sin que nadie lo pidiera.
  const hoyAnterior = useRef(hoy)
  useEffect(() => {
    if (fecha === hoyAnterior.current && hoy !== fecha) setFecha(hoy)
    hoyAnterior.current = hoy
  }, [hoy]) // sólo cuando cambia `hoy`: `fecha` se lee del render en curso a propósito

  // Sin tareas en memoria no hay «nada para este día»: o se está cargando o falló la carga.
  const estado = cargando && tareas.length === 0 ? 'cargando' : !!error && !cargando && tareas.length === 0 ? 'error' : null

  // Al mover el período, el día elegido se va con él (mes: mismo número de día si existe).
  const saltar = (n) => {
    setDireccion(n > 0 ? 1 : -1)
    if (vista === 'mes') {
      const destino = mesDe(sumarMeses(fecha, n))
      setFecha(sumarDias(destino.primero, Math.min(deISO(fecha).getDate(), destino.dias.length) - 1))
    } else if (vista === 'semana') setFecha(sumarDias(fecha, 7 * n))
    else setFecha(sumarDias(fecha, n))
  }
  const irAHoy = () => { setDireccion(fecha < hoy ? 1 : -1); setFecha(hoy) }
  // Tocar un día apagado del mes vecino remonta la vista: que entre por el lado correcto
  const alElegir = (iso) => { setDireccion(iso >= fecha ? 1 : -1); setFecha(iso) }
  const alNueva = (iso) => nuevaTarea({ vence: iso })

  const cabecera = useMemo(() => etiquetas(vista, fecha, hoy), [vista, fecha, hoy])
  const claveVista = vista === 'mes' ? sumarMeses(fecha, 0) : vista === 'semana' ? semanaDe(fecha)[0] : fecha

  return (
    <div className="pantalla calendario">
      <Segmentos opciones={VISTAS} valor={vista} alCambiar={setVista} className="cal-segmentos" />

      <CabeceraPeriodo
        {...cabecera}
        direccion={direccion}
        alAnterior={() => saltar(-1)}
        alSiguiente={() => saltar(1)}
        mostrarHoy={fecha !== hoy}
        alHoy={irAHoy}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${vista}-${claveVista}`}
          initial={{ opacity: 0, x: 18 * direccion }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 * direccion }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {vista === 'mes' && <VistaMes tareas={tareas} mes={claveVista} fecha={fecha} hoy={hoy} estado={estado} alElegir={alElegir} alNueva={alNueva} />}
          {vista === 'semana' && <VistaSemana tareas={tareas} fecha={fecha} hoy={hoy} estado={estado} alElegir={alElegir} alNueva={alNueva} />}
          {vista === 'dia' && <VistaDia tareas={tareas} fecha={fecha} hoy={hoy} estado={estado} alNueva={alNueva} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

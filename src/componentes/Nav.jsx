import { motion } from 'framer-motion'
import {
  Home, ListChecks, CalendarDays, Repeat, Dumbbell, BarChart3, Mic, MoonStar, Landmark, Flag,
  Sun, Briefcase, HeartPulse, Wallet, LineChart, Scale,
} from 'lucide-react'

/**
 * La estructura de 2day (LOGICA §18.1, Alex 30-10-2026: «estructura la app con sentido»).
 * Once secciones repartidas en CINCO ESPACIOS, cada uno con una sola pregunta:
 *   Día        ¿qué toca hoy y cómo lo cierro?      Hoy · Cierre
 *   Trabajo    ¿qué muevo y cuándo?                 Tareas · Calendario · Frentes · Meetings
 *   Cuerpo     ¿cómo está el cuerpo?                Hábitos · Fitness
 *   Dinero     ¿cuánto tengo y qué hago con él?     Finanzas · Contabilidad
 *   Análisis   ¿qué dicen mis números?              Stats
 * El menú radial y el raíl navegan por espacios; dentro de cada uno, sus secciones van en
 * pestañas de texto bajo la cabecera. Las claves de sección son las de App (PANTALLAS).
 */
export const PESTANAS = [
  { clave: 'hoy', etiqueta: 'Hoy', Icono: Home, espacio: 'dia' },
  { clave: 'eod', etiqueta: 'Cierre', Icono: MoonStar, espacio: 'dia' },            // LOGICA §16
  { clave: 'tareas', etiqueta: 'Tareas', Icono: ListChecks, espacio: 'trabajo' },
  { clave: 'calendario', etiqueta: 'Calendario', Icono: CalendarDays, espacio: 'trabajo' },
  { clave: 'frentes', etiqueta: 'Frentes', Icono: Flag, espacio: 'trabajo' },       // LOGICA §10.5
  { clave: 'meetings', etiqueta: 'Meetings', Icono: Mic, espacio: 'trabajo' },      // LOGICA §15
  { clave: 'habitos', etiqueta: 'Hábitos', Icono: Repeat, espacio: 'cuerpo' },
  { clave: 'fitness', etiqueta: 'Fitness', Icono: Dumbbell, espacio: 'cuerpo' },    // LOGICA §11
  { clave: 'finanzas', etiqueta: 'Finanzas', Icono: Landmark, espacio: 'dinero' },  // LOGICA §17
  { clave: 'contabilidad', etiqueta: 'Contabilidad', Icono: Scale, espacio: 'dinero' }, // LOGICA §17.7
  { clave: 'estadisticas', etiqueta: 'Stats', Icono: BarChart3, espacio: 'analisis' },
]

export const ESPACIOS = [
  { clave: 'dia', etiqueta: 'Día', Icono: Sun, lema: 'lo de hoy, y su cierre.' },
  { clave: 'trabajo', etiqueta: 'Trabajo', Icono: Briefcase, lema: 'lo que mueve los frentes.' },
  { clave: 'cuerpo', etiqueta: 'Cuerpo', Icono: HeartPulse, lema: 'el físico también es sistema.' },
  { clave: 'dinero', etiqueta: 'Dinero', Icono: Wallet, lema: 'cada euro con un trabajo.' },
  { clave: 'analisis', etiqueta: 'Análisis', Icono: LineChart, lema: 'lo que dicen tus números.' },
].map(e => ({ ...e, secciones: PESTANAS.filter(p => p.espacio === e.clave) }))

export const espacioDe = (seccion) => ESPACIOS.find(e => e.secciones.some(s => s.clave === seccion)) || null

// Nav inferior fija (en móvil la sustituye el menú radial, §18; se queda para el muestrario).
// `activa` puede ser null (en Ajustes ninguna lo está).
export default function Nav({ activa, alCambiar }) {
  return (
    <div className="nav-zona">
      <nav className="nav" aria-label="Principal">
        {ESPACIOS.map(({ clave, etiqueta, Icono, secciones }) => {
          const esActiva = secciones.some(s => s.clave === activa)
          return (
            <button
              key={clave}
              className={`nav-item ${esActiva ? 'nav-item--activa' : ''}`}
              onClick={() => alCambiar?.(secciones[0].clave)}
              aria-current={esActiva ? 'page' : undefined}
            >
              <Icono size={22} strokeWidth={1.75} />
              <span>{etiqueta}</span>
              {esActiva && <motion.span className="nav-punto" layoutId="nav-punto" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

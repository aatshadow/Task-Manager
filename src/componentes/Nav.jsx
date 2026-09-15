import { motion } from 'framer-motion'
import { Home, ListChecks, CalendarDays, Repeat, BarChart3 } from 'lucide-react'

// Las cinco pestañas de LOGICA.md §5. Las claves son las que usa App para elegir pantalla.
export const PESTANAS = [
  { clave: 'hoy', etiqueta: 'Hoy', Icono: Home },
  { clave: 'tareas', etiqueta: 'Tareas', Icono: ListChecks },
  { clave: 'calendario', etiqueta: 'Calendario', Icono: CalendarDays },
  { clave: 'habitos', etiqueta: 'Hábitos', Icono: Repeat },
  { clave: 'estadisticas', etiqueta: 'Stats', Icono: BarChart3 },
]

// Nav inferior fija. Activa = icono naranja con un punto debajo que se desliza entre pestañas.
// `activa` puede ser null (en Ajustes ninguna lo está).
export default function Nav({ activa, alCambiar }) {
  return (
    <div className="nav-zona">
      <nav className="nav" aria-label="Principal">
        {PESTANAS.map(({ clave, etiqueta, Icono }) => {
          const esActiva = clave === activa
          return (
            <button
              key={clave}
              className={`nav-item ${esActiva ? 'nav-item--activa' : ''}`}
              onClick={() => alCambiar?.(clave)}
              aria-current={esActiva ? 'page' : undefined}
            >
              <Icono size={22} strokeWidth={1.75} />
              <span>{etiqueta}</span>
              {esActiva && (
                <motion.span
                  className="nav-punto"
                  layoutId="nav-punto"
                  transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                />
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

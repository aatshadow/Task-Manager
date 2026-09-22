import { motion } from 'framer-motion'
import { Plus, Settings } from 'lucide-react'
import { PESTANAS } from './Nav.jsx'

/**
 * El raíl de escritorio (LOGICA §10.0-9): sustituye a la nav inferior y al FAB. Logo,
 * «Nueva tarea» (atajo `n`), las cinco pestañas con icono y etiqueta, y abajo Ajustes con
 * el avatar. Mismas claves que la nav: quien lo monta no distingue una de otra.
 */
export default function Rail({ activa, alCambiar, alNueva, alAjustes, enAjustes, inicial = 'A', nombre = '' }) {
  return (
    <aside className="rail">
      <div className="rail-marca">2day</div>

      <button type="button" className="rail-nueva" onClick={alNueva}>
        <Plus size={18} strokeWidth={2} />
        Nueva tarea
        <kbd className="rail-tecla">n</kbd>
      </button>

      {/* el landmark de navegación es ESTA lista (no el <aside>): en móvil lo es la nav
          inferior, y quien busca «la navegación» —un lector de pantalla o una prueba—
          encuentra lo mismo en los dos tamaños */}
      <nav className="rail-lista" aria-label="Principal">
        {PESTANAS.map(({ clave, etiqueta, Icono }, i) => {
          const esActiva = clave === activa
          return (
            <button
              key={clave}
              type="button"
              className={`rail-item${esActiva ? ' rail-item--activa' : ''}`}
              onClick={() => alCambiar?.(clave)}
              aria-current={esActiva ? 'page' : undefined}
            >
              {esActiva && <motion.span className="rail-fondo" layoutId="rail-fondo" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
              <Icono size={20} strokeWidth={1.75} />
              <span className="rail-etiqueta">{etiqueta}</span>
              <kbd className="rail-tecla">{i + 1}</kbd>
            </button>
          )
        })}
      </nav>

      <div className="rail-pie">
        <button type="button" className={`rail-item${enAjustes ? ' rail-item--activa' : ''}`} onClick={alAjustes}>
          <Settings size={20} strokeWidth={1.75} />
          <span className="rail-etiqueta">Ajustes</span>
        </button>
        <div className="rail-cuenta">
          <span className="rail-avatar" aria-hidden="true">{inicial}</span>
          <span className="rail-nombre">{nombre}</span>
        </div>
      </div>
    </aside>
  )
}

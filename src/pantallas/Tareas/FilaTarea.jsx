import { motion } from 'framer-motion'
import { Repeat } from 'lucide-react'
import Marca from '../../componentes/Marca.jsx'
import Chip from '../../componentes/Chip.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { esAtrasada } from '../../datos/tareas.js'
import { textoFecha } from '../../datos/fechas.js'
import { nombreRegla } from '../../datos/repetir.js'

/**
 * La fila de tarea que comparten las pestañas de la lista. Un toque abre el detalle;
 * lo que va dentro (marca, acciones, la segunda línea) para el clic para que un botón
 * no abra la hoja. Es `motion.div` para que las listas puedan animar la salida cuando
 * una tarea deja de pertenecer a la pestaña (triada, hecha, archivada…).
 *
 *  · `conMarca`   → el círculo de completar a la izquierda (Siguiente).
 *  · `acciones`   → lo que va a la derecha del título (botón Hoy, Seguir…).
 *  · `debajo`     → una segunda línea a todo el ancho (el triaje de Bandeja, Sigue/Muere).
 *  · `meta`       → sustituye a la línea de chips por defecto (proyecto · categoría · cuadrante · vence).
 */
export default function FilaTarea({ tarea: t, conMarca = false, alCompletar, acciones, debajo, meta, abrirExterna = false, className = '' }) {
  const { hoy, abrirTarea, nombreProyecto, colorProyecto, nombreCategoria, colorCategoria, cuadrantes } = useDatos()

  const abrir = () => (abrirExterna ? abrirTarea(t.id, t) : abrirTarea(t.id))
  const parar = (e) => e.stopPropagation()

  const proyecto = nombreProyecto(t)
  const categoria = nombreCategoria(t.categoria)
  const cuadrante = t.cuadrante ? cuadrantes[t.cuadrante] : null
  const atrasada = esAtrasada(t, hoy)

  const metaPorDefecto = (proyecto || categoria || cuadrante || t.vence || t.repetir) && (
    <div className="fila-tarea-meta">
      {proyecto && <Chip color={colorProyecto(t) || 'var(--texto-2)'} pequeno>{proyecto}</Chip>}
      {categoria && <Chip color={colorCategoria(t.categoria) || 'var(--texto-2)'} pequeno>{categoria}</Chip>}
      {cuadrante && <Chip color={cuadrante.color} pequeno>{cuadrante.nombre}</Chip>}
      {t.vence && (
        <span className={`fila-tarea-vence ${atrasada ? 'fila-tarea-vence--atrasada' : ''}`}>
          {atrasada ? 'venció ' : 'vence '}{textoFecha(t.vence)}
        </span>
      )}
      {t.repetir && <span className="fila-tarea-repite" title={`Se repite ${nombreRegla(t.repetir)}`}><Repeat size={12} strokeWidth={2} /></span>}
    </div>
  )

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      className={`fila-tarea ${t.hecha ? 'fila-tarea--hecha' : ''} ${className}`}
      role="button"
      tabIndex={0}
      onClick={abrir}
      // Sólo si el teclado está sobre la fila misma: Espacio sobre la Marca (que para el clic
      // pero no el keydown) completaría la tarea Y abriría la hoja.
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir() } }}
    >
      <div className="fila-tarea-principal">
        {conMarca && <Marca hecha={t.hecha} alCambiar={alCompletar} aria-label={t.hecha ? 'Reabrir' : 'Completar'} />}
        <div className="fila-tarea-cuerpo">
          <div className="fila-tarea-titulo">{t.titulo}</div>
          {meta === undefined ? metaPorDefecto : meta}
        </div>
        {acciones && <div className="fila-tarea-acciones" onClick={parar} onKeyDown={parar}>{acciones}</div>}
      </div>
      {debajo && <div className="fila-tarea-debajo" onClick={parar} onKeyDown={parar}>{debajo}</div>}
    </motion.div>
  )
}

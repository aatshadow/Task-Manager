import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Lock } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Campo from '../../componentes/Campo.jsx'
import Boton from '../../componentes/Boton.jsx'
import Chip from '../../componentes/Chip.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as catalogos from '../../datos/catalogos.js'
import { usarGuardarCatalogo, usarListaOptimista, EntradaInline, Color, MiniBoton } from './comun.jsx'

const COLOR_NUEVA = '#8a8f98'

/**
 * Categorías: la clave nace del nombre y ya no se toca (es lo que guarda la tarea);
 * nombre y color sí. Las 7 del portal se editan igual pero no se archivan: una tarea de
 * GrowthInfo sólo admite esas siete y tienen que existir siempre para pintarse nativas.
 */
export default function SeccionCategorias() {
  const { categoriasTodas } = useDatos()
  const guardar = usarGuardarCatalogo()
  const activasFuente = useMemo(() => categoriasTodas.filter((c) => !c.archivadoEn), [categoriasTodas])
  const archivadas = useMemo(() => categoriasTodas.filter((c) => c.archivadoEn), [categoriasTodas])
  const [activas, setActivas] = usarListaOptimista(activasFuente)
  const [verArchivadas, setVerArchivadas] = useState(false)
  const [nombreNueva, setNombreNueva] = useState('')
  const [creando, setCreando] = useState(false)

  const editar = (c, cambios) => {
    setActivas((l) => l.map((x) => (x.id === c.id ? { ...x, ...cambios } : x)))
    guardar(() => catalogos.actualizarCategoria(c.id, cambios), { alFallar: () => setActivas(activasFuente) })
  }
  const archivar = (c, si) => {
    if (si) setActivas((l) => l.filter((x) => x.id !== c.id))
    guardar(() => catalogos.archivarCategoria(c.id, si), { exito: si ? 'Categoría archivada' : 'Categoría restaurada', alFallar: () => setActivas(activasFuente) })
  }
  const crear = async (e) => {
    e?.preventDefault()
    const nombre = nombreNueva.trim()
    if (!nombre || creando) return
    setCreando(true)
    const r = await guardar(() => catalogos.crearCategoria({ nombre, color: COLOR_NUEVA }), { exito: 'Categoría creada' })
    if (r) setNombreNueva('')
    setCreando(false)
  }

  return (
    <section className="seccion">
      <div className="seccion-titulo">Categorías</div>
      <Tarjeta>
        <ul className="ajustes-lista">
          {activas.map((c) => (
            <li key={c.id} className="ajustes-fila">
              <Color valor={c.color} alCambiar={(color) => editar(c, { color })} etiqueta={`Color de ${c.nombre}`} />
              <EntradaInline valor={c.nombre} alGuardar={(nombre) => editar(c, { nombre })} aria-label="Nombre de la categoría" />
              <div className="ajustes-acciones">
                {c.delPortal ? (
                  <Chip pequeno punto={false} color="var(--acento)" title="Categoría del portal: no se archiva"><Lock size={11} strokeWidth={1.75} /> portal</Chip>
                ) : (
                  <MiniBoton icono={<Archive size={16} strokeWidth={1.75} />} etiqueta="Archivar" onClick={() => archivar(c, true)} />
                )}
              </div>
              <div className="ajustes-fila-sub"><span>clave</span><code>{c.clave}</code></div>
            </li>
          ))}
        </ul>

        <form className="ajustes-anadir" onSubmit={crear}>
          <Campo placeholder="Nueva categoría" valor={nombreNueva} alCambiar={setNombreNueva} aria-label="Nueva categoría" enterKeyHint="done" />
          <Boton type="submit" variante="secundario" disabled={!nombreNueva.trim()} cargando={creando}>Añadir</Boton>
        </form>
        <p className="ajustes-ayuda">La clave sale del nombre al crearla y ya no cambia: es lo que guarda cada tarea.</p>

        {archivadas.length > 0 && (
          <>
            <button type="button" className="ajustes-plegado" onClick={() => setVerArchivadas((v) => !v)} aria-expanded={verArchivadas}>
              {verArchivadas ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}
              Archivadas ({archivadas.length})
            </button>
            {verArchivadas && (
              <ul className="ajustes-lista">
                {archivadas.map((c) => (
                  <li key={c.id} className="ajustes-fila ajustes-fila--apagada">
                    <span className="ajustes-color ajustes-color--apagado" style={{ background: c.color }} />
                    <span className="ajustes-inline">{c.nombre}</span>
                    <div className="ajustes-acciones">
                      <MiniBoton icono={<ArchiveRestore size={16} strokeWidth={1.75} />} etiqueta="Restaurar" onClick={() => archivar(c, false)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Tarjeta>
    </section>
  )
}

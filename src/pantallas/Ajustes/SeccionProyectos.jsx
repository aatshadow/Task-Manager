import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, FolderKanban } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Campo from '../../componentes/Campo.jsx'
import Boton from '../../componentes/Boton.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as catalogos from '../../datos/catalogos.js'
import { usarGuardarCatalogo, usarCola, usarListaOptimista, moverEn, sincronizarPosiciones, EntradaInline, Color, MiniBoton, Orden } from './comun.jsx'

const COLOR_NUEVO = '#f26b1b'

/**
 * Un emoji compuesto (tono de piel, ZWJ como 👨‍💻, banderas) son varias unidades UTF-16:
 * se recorta por grafemas, no por caracteres, para no guardar un emoji roto.
 */
const primerGrafema = (v) => {
  const t = String(v || '').trim()
  if (!t) return ''
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return new Intl.Segmenter().segment(t)[Symbol.iterator]().next().value?.segment || ''
  }
  return Array.from(t)[0] || ''   // sin Segmenter: al menos por code point, no por unidad UTF-16
}

/**
 * Proyectos propios: nombre, emoji y color en línea, ▲▼ para el orden, archivar y
 * restaurar. Los clientes de GrowthInfo no están aquí a propósito (LOGICA §2): entran
 * solos como proyectos de cliente y no se editan desde 2day.
 */
export default function SeccionProyectos() {
  const { proyectosTodos } = useDatos()
  const guardar = usarGuardarCatalogo()
  const encolar = usarCola()
  const activosFuente = useMemo(() => proyectosTodos.filter((p) => !p.archivadoEn), [proyectosTodos])
  const archivados = useMemo(() => proyectosTodos.filter((p) => p.archivadoEn), [proyectosTodos])
  const [activos, setActivos] = usarListaOptimista(activosFuente)
  const [verArchivados, setVerArchivados] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [creando, setCreando] = useState(false)

  const editar = (p, cambios) => {
    setActivos((l) => l.map((x) => (x.id === p.id ? { ...x, ...cambios } : x)))
    guardar(() => catalogos.actualizarProyecto(p.id, cambios), { alFallar: () => setActivos(activosFuente) })
  }
  const mover = (i, delta) => {
    const nueva = moverEn(activos, i, delta)
    if (nueva === activos) return
    setActivos(nueva)
    // En cola: dos toques seguidos no pueden entrelazar sus updates de posición.
    encolar(() => sincronizarPosiciones(nueva, (id, posicion) => catalogos.actualizarProyecto(id, { posicion })), { alFallar: () => setActivos(activosFuente) })
  }
  const archivar = (p, si) => {
    if (si) setActivos((l) => l.filter((x) => x.id !== p.id))
    guardar(() => catalogos.archivarProyecto(p.id, si), { exito: si ? 'Proyecto archivado' : 'Proyecto restaurado', alFallar: () => setActivos(activosFuente) })
  }
  const crear = async (e) => {
    e?.preventDefault()
    const nombre = nombreNuevo.trim()
    if (!nombre || creando) return
    setCreando(true)
    const r = await guardar(() => catalogos.crearProyecto({ nombre, color: COLOR_NUEVO }), { exito: 'Proyecto creado' })
    if (r) setNombreNuevo('')
    setCreando(false)
  }

  return (
    <section className="seccion">
      <div className="seccion-titulo">Proyectos</div>
      <Tarjeta>
        {activos.length === 0 ? (
          <Vacio icono={FolderKanban} titulo="Sin proyectos" texto="Los clientes de GrowthInfo ya cuentan como proyectos." />
        ) : (
          <ul className="ajustes-lista">
            {activos.map((p, i) => (
              <li key={p.id} className="ajustes-fila">
                <input
                  className="ajustes-icono"
                  value={p.icono || ''}
                  placeholder="·"
                  aria-label="Icono"
                  onChange={(e) => setActivos((l) => l.map((x) => (x.id === p.id ? { ...x, icono: e.target.value } : x)))}
                  onBlur={(e) => {
                    const v = primerGrafema(e.target.value)
                    setActivos((l) => l.map((x) => (x.id === p.id ? { ...x, icono: v } : x)))
                    if (v !== (activosFuente.find((x) => x.id === p.id)?.icono || '')) editar(p, { icono: v })
                  }}
                />
                <Color valor={p.color} alCambiar={(color) => editar(p, { color })} etiqueta={`Color de ${p.nombre}`} />
                <EntradaInline valor={p.nombre} alGuardar={(nombre) => editar(p, { nombre })} aria-label="Nombre del proyecto" />
                <div className="ajustes-acciones">
                  <Orden arriba={() => mover(i, -1)} abajo={() => mover(i, 1)} puedeSubir={i > 0} puedeBajar={i < activos.length - 1} />
                  <MiniBoton icono={<Archive size={16} strokeWidth={1.75} />} etiqueta="Archivar" onClick={() => archivar(p, true)} />
                </div>
              </li>
            ))}
          </ul>
        )}

        <form className="ajustes-anadir" onSubmit={crear}>
          <Campo placeholder="Nuevo proyecto" valor={nombreNuevo} alCambiar={setNombreNuevo} aria-label="Nuevo proyecto" enterKeyHint="done" />
          <Boton type="submit" variante="secundario" disabled={!nombreNuevo.trim()} cargando={creando}>Añadir</Boton>
        </form>

        {archivados.length > 0 && (
          <>
            <button type="button" className="ajustes-plegado" onClick={() => setVerArchivados((v) => !v)} aria-expanded={verArchivados}>
              {verArchivados ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}
              Archivados ({archivados.length})
            </button>
            {verArchivados && (
              <ul className="ajustes-lista">
                {archivados.map((p) => (
                  <li key={p.id} className="ajustes-fila ajustes-fila--apagada">
                    <span className="ajustes-icono ajustes-icono--lectura" aria-hidden>{p.icono || '·'}</span>
                    <span className="ajustes-color ajustes-color--apagado" style={{ background: p.color }} />
                    <span className="ajustes-inline">{p.nombre}</span>
                    <div className="ajustes-acciones">
                      <MiniBoton icono={<ArchiveRestore size={16} strokeWidth={1.75} />} etiqueta="Restaurar" onClick={() => archivar(p, false)} />
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

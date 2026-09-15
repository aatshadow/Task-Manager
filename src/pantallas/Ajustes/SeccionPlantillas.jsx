import { useCallback, useEffect, useState } from 'react'
import { CloudOff, Eye, LayoutTemplate, Pencil, Play, Trash2 } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Campo from '../../componentes/Campo.jsx'
import Boton from '../../componentes/Boton.jsx'
import Chip from '../../componentes/Chip.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as plantillas from '../../datos/plantillas.js'
import HojaPlantilla from './HojaPlantilla.jsx'
import HojaUsar from './HojaUsar.jsx'
import { MiniBoton, Confirmar } from './comun.jsx'

/**
 * Plantillas propias (crear, editar, borrar, usar) y las de la agencia (`task_templates`,
 * sólo lectura: ver y usar). No están en el contexto porque sólo se tocan desde aquí:
 * se cargan al entrar y se mantienen en memoria con lo que devuelve cada escritura.
 */
export default function SeccionPlantillas() {
  const { avisar } = useDatos()
  const [lista, setLista] = useState(null)             // null = cargando
  const [errorCarga, setErrorCarga] = useState(null)   // si la lectura falla, no se miente con «Sin plantillas»
  const [nombreNueva, setNombreNueva] = useState('')
  const [creando, setCreando] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [usandoId, setUsandoId] = useState(null)
  const [borrandoId, setBorrandoId] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    setErrorCarga(null)
    setLista(null)
    try {
      setLista(await plantillas.cargarPlantillas())
    } catch (e) {
      setLista([])
      setErrorCarga(e?.message || 'No se pudieron leer las plantillas')
      avisar(e?.message || 'No se pudieron leer las plantillas', 'error')
    }
  }, [avisar])
  useEffect(() => { cargar() }, [cargar])

  // Recibe un PARCHE ({ id, origen, ...campos }): la hoja escribe cabecera e ítems por
  // separado y en vuelo, y fundir en vez de sustituir evita que una escritura pise a la otra.
  const sustituir = useCallback((parche) => setLista((l) => (l || []).map((x) => (x.id === parche.id && x.origen === (parche.origen || x.origen) ? { ...x, ...parche } : x))), [])

  const crear = async (e) => {
    e?.preventDefault()
    const nombre = nombreNueva.trim()
    if (!nombre || creando) return
    setCreando(true)
    try {
      const p = await plantillas.crearPlantilla({ nombre })
      // Las propias van antes que las de la agencia, en el orden en que nacieron.
      setLista((l) => { const propias = (l || []).filter((x) => x.origen === 'hoy'); const agencia = (l || []).filter((x) => x.origen !== 'hoy'); return [...propias, p, ...agencia] })
      setNombreNueva('')
      setEditandoId(p.id)
    } catch (err) {
      avisar(err?.message || 'No se pudo crear la plantilla', 'error')
    } finally {
      setCreando(false)
    }
  }

  const borrar = async () => {
    const p = (lista || []).find((x) => x.id === borrandoId)
    if (!p) return
    setOcupado(true)
    try {
      await plantillas.borrarPlantilla(p.id)
      setLista((l) => (l || []).filter((x) => x.id !== p.id))
      setBorrandoId(null)
      avisar('Plantilla borrada', 'ok')
    } catch (err) {
      avisar(err?.message || 'No se pudo borrar', 'error')
    } finally {
      setOcupado(false)
    }
  }

  const propias = (lista || []).filter((p) => p.origen === 'hoy')
  const agencia = (lista || []).filter((p) => p.origen !== 'hoy')
  const editando = (lista || []).find((p) => p.id === editandoId) || null
  const usando = (lista || []).find((p) => p.id === usandoId) || null

  const tarjeta = (p) => (
    <Tarjeta key={`${p.origen}:${p.id}`} elevada compacta className="ajustes-plantilla">
      <div className="ajustes-plantilla-cabeza">
        <div className="ajustes-plantilla-textos">
          <div className="ajustes-plantilla-nombre">{p.nombre}</div>
          {p.descripcion && <div className="ajustes-plantilla-desc">{p.descripcion}</div>}
        </div>
        {p.soloLectura && <Chip pequeno punto={false} color="var(--acento)">agencia</Chip>}
      </div>
      <div className="ajustes-plantilla-pie">
        <span className="t-terciario">{p.items.length} {p.items.length === 1 ? 'ítem' : 'ítems'}</span>
        <span className="espacio" />
        <MiniBoton
          icono={p.soloLectura ? <Eye size={16} strokeWidth={1.75} /> : <Pencil size={16} strokeWidth={1.75} />}
          etiqueta={p.soloLectura ? 'Ver' : 'Editar'}
          onClick={() => setEditandoId(p.id)}
        />
        {!p.soloLectura && (
          <MiniBoton icono={<Trash2 size={16} strokeWidth={1.75} />} etiqueta="Borrar plantilla" peligro onClick={() => setBorrandoId(p.id)} />
        )}
        <Boton pequeno icono={<Play size={14} strokeWidth={1.75} />} onClick={() => setUsandoId(p.id)} disabled={!p.items.length}>Usar</Boton>
      </div>
      {borrandoId === p.id && (
        <Confirmar
          texto={`¿Borrar «${p.nombre}»? Las tareas que ya nacieron de ella se quedan.`}
          alConfirmar={borrar}
          alCancelar={() => setBorrandoId(null)}
          ocupado={ocupado}
        />
      )}
    </Tarjeta>
  )

  return (
    <section className="seccion">
      <div className="seccion-titulo">Plantillas</div>
      <Tarjeta>
        {lista === null ? (
          <p className="t-secundario">Cargando…</p>
        ) : errorCarga ? (
          <Vacio icono={CloudOff} titulo="No se pudieron leer" texto={errorCarga} accion={<Boton variante="secundario" pequeno onClick={cargar}>Reintentar</Boton>} />
        ) : propias.length === 0 ? (
          <Vacio icono={LayoutTemplate} titulo="Sin plantillas propias" texto="Una plantilla es una lista de tareas que nace entera en un proyecto o cliente." />
        ) : (
          <div className="ajustes-plantillas">{propias.map(tarjeta)}</div>
        )}

        <form className="ajustes-anadir" onSubmit={crear}>
          <Campo placeholder="Nueva plantilla" valor={nombreNueva} alCambiar={setNombreNueva} aria-label="Nueva plantilla" enterKeyHint="done" />
          <Boton type="submit" variante="secundario" disabled={!nombreNueva.trim()} cargando={creando}>Crear</Boton>
        </form>

        {agencia.length > 0 && (
          <>
            <div className="seccion-titulo ajustes-subseccion">De la agencia</div>
            <div className="ajustes-plantillas">{agencia.map(tarjeta)}</div>
          </>
        )}
      </Tarjeta>

      <HojaPlantilla plantilla={editando} abierta={Boolean(editando)} alCerrar={() => setEditandoId(null)} alCambiar={sustituir} />
      <HojaUsar plantilla={usando} abierta={Boolean(usando)} alCerrar={() => setUsandoId(null)} />
    </section>
  )
}

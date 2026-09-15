import { useState } from 'react'
import { Flag, Star, Trash2 } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Campo from '../../componentes/Campo.jsx'
import Boton from '../../componentes/Boton.jsx'
import Chip from '../../componentes/Chip.jsx'
import Selector from '../../componentes/Selector.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as catalogos from '../../datos/catalogos.js'
import { ESTADOS } from '../../datos/catalogos.js'
import { usarGuardarCatalogo, usarCola, usarListaOptimista, moverEn, EntradaInline, Color, MiniBoton, Orden, Confirmar } from './comun.jsx'

const COLOR_ETAPA = '#8a8f98'

/**
 * Pipelines (tableros) de las tareas personales y sus etapas. La clave de una etapa sale
 * del nombre al crearla; si coincide con el vocabulario común (`todo·in_progress·review·
 * blocked·done`) el estado la sigue al mover, y `done` nace terminal (LOGICA §1).
 * Un tablero nuevo nace con las cinco etapas del vocabulario, como «Principal».
 */
export default function SeccionPipelines() {
  const { pipelines } = useDatos()
  const guardar = usarGuardarCatalogo()
  const encolar = usarCola()
  const [lista, setLista] = usarListaOptimista(pipelines)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [creando, setCreando] = useState(false)

  const crearPipeline = async (e) => {
    e?.preventDefault()
    const nombre = nombreNuevo.trim()
    if (!nombre || creando) return
    setCreando(true)
    const r = await guardar(async () => {
      const p = await catalogos.crearPipeline({ nombre })
      // Sin etapas un tablero no puede recibir tareas: nace con el vocabulario (en un
      // solo insert) y se poda.
      await catalogos.crearEtapas(p.id, ESTADOS.map((s, i) => ({ nombre: s.nombre, clave: s.clave, color: s.color, esTerminal: s.clave === 'done', posicion: i })))
      return p
    }, { exito: 'Tablero creado' })
    if (r) setNombreNuevo('')
    setCreando(false)
  }

  return (
    <section className="seccion">
      <div className="seccion-titulo">Pipelines y etapas</div>
      <Tarjeta>
        {lista.map((p) => (
          <Pipeline key={p.id} pipeline={p} guardar={guardar} encolar={encolar} setLista={setLista} restaurar={() => setLista(pipelines)} />
        ))}
        <form className="ajustes-anadir" onSubmit={crearPipeline}>
          <Campo placeholder="Nuevo pipeline" valor={nombreNuevo} alCambiar={setNombreNuevo} aria-label="Nuevo pipeline" enterKeyHint="done" />
          <Boton type="submit" variante="secundario" disabled={!nombreNuevo.trim()} cargando={creando}>Añadir</Boton>
        </form>
        <p className="ajustes-ayuda">Sólo para tareas personales. Los tableros de cada cliente los gobierna el portal.</p>
      </Tarjeta>
    </section>
  )
}

function Pipeline({ pipeline: p, guardar, encolar, setLista, restaurar }) {
  const [nombreEtapa, setNombreEtapa] = useState('')
  const [creando, setCreando] = useState(false)
  const [borrando, setBorrando] = useState(null)     // id de la etapa con la confirmación abierta
  const [destino, setDestino] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const parchear = (cambiosPipeline) => setLista((l) => l.map((x) => (x.id === p.id ? { ...x, ...cambiosPipeline } : x)))
  const parchearEtapa = (id, cambios) => parchear({ etapas: p.etapas.map((e) => (e.id === id ? { ...e, ...cambios } : e)) })

  const renombrar = (nombre) => {
    parchear({ nombre })
    guardar(() => catalogos.actualizarPipeline(p.id, { nombre }), { alFallar: restaurar })
  }
  const hacerDefault = () => {
    if (p.esDefault) return
    setLista((l) => l.map((x) => ({ ...x, esDefault: x.id === p.id })))
    guardar(() => catalogos.actualizarPipeline(p.id, { esDefault: true }), { exito: `«${p.nombre}» es ahora el tablero por defecto`, alFallar: restaurar })
  }

  const editarEtapa = (e, cambios) => {
    parchearEtapa(e.id, cambios)
    guardar(() => catalogos.actualizarEtapa(e.id, cambios), { alFallar: restaurar })
  }
  const moverEtapa = (i, delta) => {
    const nuevas = moverEn(p.etapas, i, delta)
    if (nuevas === p.etapas) return
    parchear({ etapas: nuevas.map((e, k) => ({ ...e, posicion: k })) })
    // En cola: dos toques seguidos no pueden entrelazar sus updates de posición.
    encolar(() => catalogos.reordenarEtapas(p.id, nuevas.map((e) => e.id)), { alFallar: restaurar })
  }
  const crearEtapa = async (ev) => {
    ev?.preventDefault()
    const nombre = nombreEtapa.trim()
    if (!nombre || creando) return
    setCreando(true)
    const r = await guardar(() => catalogos.crearEtapa(p.id, { nombre, color: COLOR_ETAPA }))
    if (r) setNombreEtapa('')
    setCreando(false)
  }
  const pedirBorrar = (e) => {
    setBorrando(e.id)
    setDestino(p.etapas.find((x) => x.id !== e.id)?.id || null)
  }
  const borrar = async () => {
    const e = p.etapas.find((x) => x.id === borrando)
    if (!e) return
    setOcupado(true)
    const r = await guardar(() => catalogos.borrarEtapa(e.id, destino), { exito: 'Etapa borrada', alFallar: restaurar })
    setOcupado(false)
    if (r) { setBorrando(null); setDestino(null) }
  }

  const soloUna = p.etapas.length <= 1

  return (
    <div className="ajustes-tablero">
      <div className="ajustes-tablero-cabecera">
        <EntradaInline valor={p.nombre} alGuardar={renombrar} aria-label="Nombre del pipeline" />
        <Chip pequeno punto={false} color="var(--acento)" activo={p.esDefault} onClick={hacerDefault} aria-label={p.esDefault ? 'Tablero por defecto' : 'Hacer por defecto'}>
          <Star size={11} strokeWidth={1.75} /> {p.esDefault ? 'por defecto' : 'hacer por defecto'}
        </Chip>
      </div>

      <ul className="ajustes-lista">
        {p.etapas.map((e, i) => (
          <li key={e.id} className="ajustes-fila">
            <Color valor={e.color} alCambiar={(color) => editarEtapa(e, { color })} etiqueta={`Color de ${e.nombre}`} />
            <EntradaInline valor={e.nombre} alGuardar={(nombre) => editarEtapa(e, { nombre })} aria-label="Nombre de la etapa" />
            <div className="ajustes-acciones">
              <Orden arriba={() => moverEtapa(i, -1)} abajo={() => moverEtapa(i, 1)} puedeSubir={i > 0} puedeBajar={i < p.etapas.length - 1} />
              <MiniBoton
                icono={<Trash2 size={16} strokeWidth={1.75} />}
                etiqueta={soloUna ? 'La última etapa no se borra' : 'Borrar etapa'}
                peligro
                disabled={soloUna}
                onClick={() => pedirBorrar(e)}
              />
            </div>
            <div className="ajustes-fila-sub">
              <code>{e.clave}</code>
              {e.clave === 'done' ? (
                // `done` siempre termina: completar desde Hoy mueve aquí con hecha = terminal.
                <Chip pequeno punto={false} color="var(--ok)" activo title="«done» siempre es terminal: es donde llega una tarea al marcarla hecha">
                  <Flag size={11} strokeWidth={1.75} /> terminal
                </Chip>
              ) : (
                <Chip pequeno punto={false} color="var(--ok)" activo={e.esTerminal} onClick={() => editarEtapa(e, { esTerminal: !e.esTerminal })} aria-label={e.esTerminal ? 'Etapa terminal: al llegar, la tarea se da por hecha' : 'Marcar como terminal'}>
                  <Flag size={11} strokeWidth={1.75} /> {e.esTerminal ? 'terminal' : 'no terminal'}
                </Chip>
              )}
            </div>
            {borrando === e.id && (
              <Confirmar
                texto={`¿Borrar «${e.nombre}»? Las tareas que están en ella se recolocan.`}
                alConfirmar={borrar}
                alCancelar={() => { setBorrando(null); setDestino(null) }}
                ocupado={ocupado}
              >
                <Selector
                  etiqueta="Pasan a"
                  modo="desplegable"
                  opciones={p.etapas.filter((x) => x.id !== e.id).map((x) => ({ valor: x.id, etiqueta: x.nombre }))}
                  valor={destino}
                  alCambiar={setDestino}
                />
              </Confirmar>
            )}
          </li>
        ))}
      </ul>

      <form className="ajustes-anadir ajustes-anadir--etapa" onSubmit={crearEtapa}>
        <Campo placeholder="Nueva etapa" valor={nombreEtapa} alCambiar={setNombreEtapa} aria-label={`Nueva etapa en ${p.nombre}`} enterKeyHint="done" />
        <Boton type="submit" variante="secundario" pequeno disabled={!nombreEtapa.trim()} cargando={creando}>Añadir</Boton>
      </form>
    </div>
  )
}

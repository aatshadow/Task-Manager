import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Repeat, Sun } from 'lucide-react'
import Hoja from './Hoja.jsx'
import Campo from './Campo.jsx'
import Boton from './Boton.jsx'
import Chip from './Chip.jsx'
import Selector from './Selector.jsx'
import SelectorRepetir from './SelectorRepetir.jsx'
import { useDatos } from '../estado/useDatos.jsx'
import * as datosTareas from '../datos/tareas.js'
import { textoFecha } from '../datos/fechas.js'
import { nombreRegla } from '../datos/repetir.js'

// La captura rápida del «+» (LOGICA §5): un título y listo → Bandeja. Lo demás (proyecto,
// cuadrante, fecha, Hoy) está plegado bajo «más» para que capturar no cueste nada.
// Se abre con `nuevaTarea(prefill)` del contexto: la pantalla Hoy manda { hoyPara },
// el calendario { vence }, un tablero { proyectoId } o { clientId }.
//
// Un proyecto de cliente convierte la captura en una tarea de GrowthInfo (`tasks`);
// el valor del desplegable lleva prefijo para no confundir un uuid de proyecto con
// una clave de cliente.
export default function NuevaTarea() {
  const {
    prefillNueva, cerrarNueva, hoy, proyectos, clientes, listaCuadrantes,
    actualizarLocal, recargar, avisar,
  } = useDatos()
  const abierta = prefillNueva !== null

  // El formulario nace limpio en cada apertura (`key` = nº de apertura) y se queda
  // montado mientras la hoja baja: si se quitara al cerrar, la animación de salida
  // enseñaría una hoja vacía.
  const ultimoPrefill = useRef(null)
  const aperturas = useRef(0)
  if (abierta && prefillNueva !== ultimoPrefill.current) { ultimoPrefill.current = prefillNueva; aperturas.current += 1 }

  return (
    <Hoja abierta={abierta} alCerrar={cerrarNueva} titulo="Nueva tarea">
      {aperturas.current > 0 && (
        <Formulario
          key={aperturas.current}
          prefill={ultimoPrefill.current}
          hoy={hoy}
          proyectos={proyectos}
          clientes={clientes}
          listaCuadrantes={listaCuadrantes}
          alCrear={async (datos) => {
            const t = await datosTareas.crear(datos)
            actualizarLocal(t)
            recargar()
            return t
          }}
          alHecho={cerrarNueva}
          avisar={avisar}
        />
      )}
    </Hoja>
  )
}

const opcionProyecto = (p) => ({ valor: `p:${p.id}`, etiqueta: `${p.icono ? `${p.icono} ` : ''}${p.nombre}` })
const opcionCliente = (c) => ({ valor: `c:${c.id}`, etiqueta: `${c.nombre} · cliente` })

function Formulario({ prefill, hoy, proyectos, clientes, listaCuadrantes, alCrear, alHecho, avisar }) {
  const [titulo, setTitulo] = useState('')
  const [proyecto, setProyecto] = useState(
    prefill?.clientId ? `c:${prefill.clientId}` : prefill?.proyectoId ? `p:${prefill.proyectoId}` : null,
  )
  const [cuadrante, setCuadrante] = useState(prefill?.cuadrante || null)
  const [vence, setVence] = useState(prefill?.vence || '')
  const [repetir, setRepetir] = useState(prefill?.repetir || null)
  const [enHoy, setEnHoy] = useState(Boolean(prefill?.hoyPara))
  // «más» nace abierto si el prefill ya trae algo que enseñar: que se vea lo que viene puesto
  const [mas, setMas] = useState(Boolean(prefill?.clientId || prefill?.proyectoId || prefill?.cuadrante || prefill?.vence))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const opciones = useMemo(() => [
    ...proyectos.map(opcionProyecto),
    ...clientes.map(opcionCliente),
  ], [proyectos, clientes])
  const opcionesCuadrante = useMemo(() => listaCuadrantes.map((q) => ({ valor: q.clave, etiqueta: q.nombre, color: q.color })), [listaCuadrantes])

  useEffect(() => { setError('') }, [titulo])

  const listo = titulo.trim() !== '' && !guardando

  const enviar = async (e) => {
    e?.preventDefault()
    if (!listo) return
    setGuardando(true); setError('')
    const esCliente = proyecto?.startsWith('c:')
    const datos = {
      titulo: titulo.trim(),
      origen: esCliente ? 'portal' : 'hoy',
      ...(esCliente ? { clientId: proyecto.slice(2) } : proyecto ? { proyectoId: proyecto.slice(2) } : {}),
      cuadrante: cuadrante || null,
      // una serie necesita ancla: con regla y sin fecha, vence hoy (LOGICA §4.1.6)
      vence: vence || (repetir ? hoy : null),
      repetir: repetir || null,
      hoyPara: enHoy ? (prefill?.hoyPara || hoy) : null,
    }
    try {
      await alCrear(datos)
      const aDonde = esCliente ? 'Añadida en GrowthInfo' : !proyecto && !cuadrante ? 'Añadida a Bandeja' : 'Añadida'
      avisar(aDonde, 'ok')
      alHecho()
    } catch (err) {
      setError(err.message || 'No se pudo añadir')
      avisar(err.message || 'No se pudo añadir', 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form className="nueva" onSubmit={enviar} noValidate>
      <Campo
        etiqueta="Título"
        placeholder="¿Qué hay que hacer?"
        valor={titulo}
        alCambiar={setTitulo}
        autoFocus
        enterKeyHint="done"
        error={error || undefined}
      />

      <div className="nueva-resumen">
        <Chip
          color="var(--acento)"
          activo={enHoy}
          onClick={() => setEnHoy((v) => !v)}
          punto={false}
          aria-label={enHoy ? 'Quitar de Hoy' : 'Poner en Hoy'}
        >
          <Sun size={14} strokeWidth={1.75} /> Hoy
        </Chip>
        {vence && <Chip color="var(--texto-2)" pequeno>{textoFecha(vence)}</Chip>}
        {repetir && <Chip color="var(--acento)" pequeno punto={false}><Repeat size={12} strokeWidth={2} /> {nombreRegla(repetir)}</Chip>}
        <span className="espacio" />
        <button type="button" className="nueva-mas" onClick={() => setMas((v) => !v)} aria-expanded={mas}>
          {mas ? 'menos' : 'más'}
          {mas ? <ChevronUp size={16} strokeWidth={1.75} /> : <ChevronDown size={16} strokeWidth={1.75} />}
        </button>
      </div>

      {mas && (
        <div className="nueva-mas-campos">
          <Selector
            etiqueta="Proyecto"
            modo="desplegable"
            opciones={opciones}
            valor={proyecto}
            alCambiar={setProyecto}
            placeholder="Sin proyecto (Bandeja)"
            permitirVacio
          />
          <Selector
            etiqueta="Cuadrante"
            opciones={opcionesCuadrante}
            valor={cuadrante}
            alCambiar={setCuadrante}
            permitirVacio
          />
          <Campo etiqueta="Vence" type="date" valor={vence} alCambiar={setVence} />
          <SelectorRepetir valor={repetir} alCambiar={(r) => { setRepetir(r); if (r && !vence) setVence(hoy) }} />
        </div>
      )}

      <div className="nueva-pie">
        <Boton type="submit" completo cargando={guardando} disabled={!listo}>Añadir</Boton>
      </div>
    </form>
  )
}

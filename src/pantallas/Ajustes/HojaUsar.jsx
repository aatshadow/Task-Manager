import { useMemo, useRef, useState } from 'react'
import Hoja from '../../componentes/Hoja.jsx'
import Campo from '../../componentes/Campo.jsx'
import Boton from '../../componentes/Boton.jsx'
import Selector from '../../componentes/Selector.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import { FolderKanban } from 'lucide-react'
import { useDatos } from '../../estado/useDatos.jsx'
import * as plantillas from '../../datos/plantillas.js'
import { textoFecha, sumarDias } from '../../datos/fechas.js'

/**
 * «Usar» una plantilla: proyecto propio o cliente + fecha base opcional → `instanciar`
 * (LOGICA §4). Mismo desplegable con prefijo `p:`/`c:` que la captura rápida: un cliente
 * hace nacer las tareas en `tasks`, un proyecto propio en `hoy_tareas`.
 */
export default function HojaUsar({ plantilla, abierta, alCerrar }) {
  const ultima = useRef(null)
  if (plantilla) ultima.current = plantilla
  const p = plantilla || ultima.current
  return (
    <Hoja abierta={abierta && Boolean(plantilla)} alCerrar={alCerrar} titulo="Usar plantilla">
      {p && <Formulario key={p.id} plantilla={p} alHecho={alCerrar} />}
    </Hoja>
  )
}

function Formulario({ plantilla: p, alHecho }) {
  const { proyectos, clientes, recargar, avisar } = useDatos()
  const [destino, setDestino] = useState(null)
  const [fechaBase, setFechaBase] = useState('')
  const [creando, setCreando] = useState(false)

  const opciones = useMemo(() => [
    ...proyectos.map((x) => ({ valor: `p:${x.id}`, etiqueta: `${x.icono ? `${x.icono} ` : ''}${x.nombre}` })),
    ...clientes.map((c) => ({ valor: `c:${c.id}`, etiqueta: `${c.nombre} · cliente` })),
  ], [proyectos, clientes])

  const n = p.items.length
  const esCliente = destino?.startsWith('c:')
  const ultimoDia = fechaBase && n ? sumarDias(fechaBase, Math.max(...p.items.map((i) => i.diasOffset || 0))) : null

  const usar = async (e) => {
    e?.preventDefault()
    if (!destino || creando || !n) return
    setCreando(true)
    try {
      const creadas = await plantillas.instanciar(p, {
        clientId: esCliente ? destino.slice(2) : null,
        proyectoId: esCliente ? null : destino.slice(2),
        fechaBase: fechaBase || null,
      })
      avisar(`${creadas.length} ${creadas.length === 1 ? 'tarea creada' : 'tareas creadas'}${esCliente ? ' en GrowthInfo' : ''}`, 'ok')
      recargar()
      alHecho()
    } catch (err) {
      // Si falló a medias, alguna ya nació: se recarga para que no queden invisibles.
      avisar(err?.message || 'No se pudieron crear las tareas', 'error')
      recargar()
    } finally {
      setCreando(false)
    }
  }

  // Sin proyecto propio ni cliente visible no hay dónde instanciar: se dice, no se apaga el botón sin más.
  if (opciones.length === 0) {
    return (
      <div className="ajustes-hoja">
        <Vacio icono={FolderKanban} titulo="Sin destino" texto="Crea un proyecto en Ajustes para usar la plantilla." />
      </div>
    )
  }

  return (
    <form className="ajustes-hoja" onSubmit={usar} noValidate>
      <div>
        <div className="t-titulo">{p.nombre}</div>
        <p className="t-secundario ajustes-hoja-sub">{n} {n === 1 ? 'ítem' : 'ítems'}{p.soloLectura ? ' · de la agencia' : ''}</p>
      </div>
      <Selector
        etiqueta="Dónde"
        modo="desplegable"
        opciones={opciones}
        valor={destino}
        alCambiar={setDestino}
        placeholder="Proyecto propio o cliente"
      />
      <Campo
        etiqueta="Fecha base (opcional)"
        type="date"
        valor={fechaBase}
        alCambiar={setFechaBase}
        ayuda={fechaBase
          ? `Cada ítem vence en su desfase a partir del ${textoFecha(fechaBase)}${ultimoDia && ultimoDia !== fechaBase ? `; el último el ${textoFecha(ultimoDia)}` : ''}.`
          : 'Sin fecha, las tareas nacen sin vencimiento.'}
      />
      <Boton type="submit" completo cargando={creando} disabled={!destino || !n}>
        {n ? `Crear ${n} ${n === 1 ? 'tarea' : 'tareas'}` : 'La plantilla está vacía'}
      </Boton>
    </form>
  )
}

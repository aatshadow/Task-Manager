import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import Hoja from '../../componentes/Hoja.jsx'
import Campo from '../../componentes/Campo.jsx'
import Boton from '../../componentes/Boton.jsx'
import Marca from '../../componentes/Marca.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as datosHitos from '../../datos/hitos.js'

/**
 * Crear o editar un frente desde el Gantt (LOGICA §5.4). `hito` null = nuevo (con `fechaInicial`).
 * El inicio es opcional: sin él, el hito es un día (la raya de siempre); con él, una barra.
 */
export default function HojaHito({ abierta, hito, fechaInicial, alCerrar }) {
  const { hitos, setHitos, recargar, avisar } = useDatos()
  const [f, setF] = useState(null)
  const [borrando, setBorrando] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (!abierta) return
    setBorrando(false)
    setF(hito
      ? { nombre: hito.nombre, frente: hito.frente, fecha: hito.fecha || '', inicio: hito.inicio || '', hecho: hito.hecho }
      : { nombre: '', frente: '', fecha: fechaInicial || '', inicio: '', hecho: false })
  }, [abierta, hito, fechaInicial])

  // Sugerencias de frente: los que ya existen, sin repetir.
  const frentes = useMemo(() => [...new Set((hitos || []).map((h) => h.frente).filter(Boolean))].sort(), [hitos])

  if (!f) return null
  const poner = (c) => setF((x) => ({ ...x, ...c }))
  const error = f.inicio && f.fecha && f.inicio > f.fecha ? 'El inicio va antes del final' : f.inicio && !f.fecha ? 'Con inicio hace falta el final' : null

  const guardar = async () => {
    if (!f.nombre.trim() || error) return
    const datos = { nombre: f.nombre.trim(), frente: f.frente.trim(), fecha: f.fecha || null, inicio: f.inicio || null, hecho: f.hecho }
    setOcupado(true)
    try {
      if (hito) {
        setHitos((hs) => hs.map((x) => (x.id === hito.id ? { ...x, ...datos } : x)))
        await datosHitos.actualizarHito(hito.id, datos)
      } else {
        await datosHitos.crearHito(datos)
      }
      await recargar()
      avisar(hito ? 'Frente guardado' : 'Frente creado', 'ok')
      alCerrar()
    } catch (e) {
      avisar(e.message || 'No se pudo guardar', 'error')
      recargar()
    } finally {
      setOcupado(false)
    }
  }

  const borrar = async () => {
    setOcupado(true)
    try {
      setHitos((hs) => hs.filter((x) => x.id !== hito.id))
      await datosHitos.borrarHito(hito.id)
      await recargar()
      avisar('Frente borrado', 'ok')
      alCerrar()
    } catch (e) {
      avisar(e.message || 'No se pudo borrar', 'error')
      recargar()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Hoja
      abierta={abierta}
      alCerrar={alCerrar}
      titulo={hito ? 'Frente' : 'Nuevo frente'}
      pie={(
        <div className="fila hhito-pie">
          {hito && !borrando && (
            <Boton variante="fantasma" pequeno icono={<Trash2 size={16} strokeWidth={1.75} />} onClick={() => setBorrando(true)}>Borrar</Boton>
          )}
          {borrando ? (
            <>
              <span className="t-secundario">¿Borrar «{hito.nombre}»?</span>
              <Boton variante="fantasma" pequeno onClick={() => setBorrando(false)} disabled={ocupado}>No</Boton>
              <Boton pequeno className="boton--borrar" onClick={borrar} cargando={ocupado}>Borrar</Boton>
            </>
          ) : (
            <Boton pequeno onClick={guardar} cargando={ocupado} disabled={!f.nombre.trim() || !!error}>{hito ? 'Guardar' : 'Crear'}</Boton>
          )}
        </div>
      )}
    >
      <div className="hhito">
        <Campo etiqueta="Frente" valor={f.frente} alCambiar={(v) => poner({ frente: v })} placeholder="Elena / Amira Girls" list="hhito-frentes" autoFocus={!hito} />
        <datalist id="hhito-frentes">{frentes.map((x) => <option key={x} value={x} />)}</datalist>
        <Campo etiqueta="Hito" valor={f.nombre} alCambiar={(v) => poner({ nombre: v })} placeholder="Lanzamiento" />
        <div className="hhito-fechas">
          <Campo etiqueta="Inicio" type="date" valor={f.inicio} alCambiar={(v) => poner({ inicio: v })} ayuda="Opcional: si dura varios días" />
          <Campo etiqueta={f.inicio ? 'Final' : 'Fecha'} type="date" valor={f.fecha} alCambiar={(v) => poner({ fecha: v })} error={error} />
        </div>
        {hito && (
          <label className="hhito-hecho">
            <Marca hecha={f.hecho} alCambiar={(si) => poner({ hecho: si })} aria-label="Hecho" />
            <span>Hecho</span>
          </label>
        )}
      </div>
    </Hoja>
  )
}

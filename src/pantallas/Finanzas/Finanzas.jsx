import { useCallback, useEffect, useMemo, useState } from 'react'
import Segmentos from '../../componentes/Segmentos.jsx'
import Boton from '../../componentes/Boton.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import { Landmark } from 'lucide-react'
import { useDatos } from '../../estado/useDatos.jsx'
import * as fin from '../../datos/finanzas.js'
import { resumen, proyeccion, porClasificar, opcionesDe } from '../../datos/finanzasCalculos.js'
import Resumen from './Resumen.jsx'
import Panel from './Panel.jsx'
import Plan from './Plan.jsx'
import Libro from './Libro.jsx'
import Asesor from './Asesor.jsx'
import HojaEditar from './HojaEditar.jsx'
import HojaClasificar from './HojaClasificar.jsx'
import HojaEfectivo from './HojaEfectivo.jsx'
import './finanzas.css'

const VISTAS = [
  { valor: 'resumen', etiqueta: 'Resumen' },
  { valor: 'panel', etiqueta: 'Panel' },
  { valor: 'plan', etiqueta: 'Plan' },
  { valor: 'libro', etiqueta: 'Libro' },
  { valor: 'asesor', etiqueta: 'Asesor' },
]

/**
 * Finanzas (LOGICA §17). Todo el estado del dinero se pide de una vez a /api/finanzas y se
 * vuelve a pedir tras cada escritura: es un solo usuario y pocos cientos de filas, así que la
 * pantalla siempre enseña lo que hay en la base y el número del día nunca se desincroniza.
 */
export default function Finanzas() {
  const { avisar } = useDatos()
  const [vista, setVista] = useState(() => { try { return localStorage.getItem('fin-vista') || 'resumen' } catch { return 'resumen' } })
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null) // { tipo, fila }
  const [clasificando, setClasificando] = useState(null) // { id, cola }
  const [filtroLibro, setFiltroLibro] = useState('todo')
  const [efectivo, setEfectivo] = useState(false)

  const recargar = useCallback(async () => {
    try { const nuevo = await fin.cargar(); setD(nuevo); setError(null); return nuevo } catch (e) { setError(e.message); return null }
  }, [])
  useEffect(() => { recargar() }, [recargar])
  useEffect(() => { try { localStorage.setItem('fin-vista', vista) } catch { /* sin almacenamiento */ } }, [vista])

  const calc = useMemo(() => (d ? { r: resumen(d), p: proyeccion(d) } : null), [d])
  const op = useMemo(() => (d ? opcionesDe(d) : null), [d])

  // una sola puerta de escritura: guarda, avisa y recarga
  const guardar = useCallback(async (tabla, fila, texto = 'Guardado') => {
    try { await fin.guardar(tabla, fila); if (texto) avisar(texto); await recargar(); return true } catch (e) { avisar(e.message, 'error'); return false }
  }, [avisar, recargar])
  const borrar = useCallback(async (tabla, id) => {
    try { await fin.borrar(tabla, id); avisar('Borrado'); await recargar(); return true } catch (e) { avisar(e.message, 'error'); return false }
  }, [avisar, recargar])

  const editar = (tipo, fila = {}) => { setEfectivo(false); setEditando({ tipo, fila }) }
  // sin id: la cola entera, del más reciente al más viejo; con id: sólo ese
  const clasificar = (id) => {
    const primero = id || d?.movimientos.find(porClasificar)?.id
    if (primero) setClasificando({ id: primero, cola: !id })
  }
  const irALibro = (filtro) => { setFiltroLibro(filtro); setVista('libro') }
  // una categoría (de gasto o de ingreso) o un negocio nuevo: se guarda en ajustes.listas (§17.6)
  const crearOpcion = useCallback(async (lista, nombre) => {
    const listas = { ...(d?.ajustes.listas || {}) }
    listas[lista] = [...new Set([...(listas[lista] || []), nombre])]
    await guardar('fin_ajustes', { listas }, `«${nombre}» creada`)
  }, [d, guardar])

  if (error && !d) {
    return (
      <div className="pantalla">
        <Vacio icono={Landmark} titulo="Finanzas no responde" texto={error} accion={<Boton variante="secundario" onClick={recargar}>Reintentar</Boton>} />
      </div>
    )
  }
  if (!d) return <div className="pantalla"><div className="fz-cargando">Leyendo tus cuentas…</div></div>

  const comun = { abrirEfectivo: () => setEfectivo(true), d, calc, op, crearOpcion, guardar, borrar, editar, recargar, avisar, clasificar, irALibro }
  return (
    <div className="pantalla fz">
      <Segmentos opciones={VISTAS} valor={vista} alCambiar={setVista} className="fz-vistas" />
      {vista === 'resumen' && <Resumen {...comun} />}
      {vista === 'panel' && <Panel {...comun} />}
      {vista === 'plan' && <Plan {...comun} />}
      {vista === 'libro' && <Libro {...comun} filtro={filtroLibro} setFiltro={setFiltroLibro} />}
      {vista === 'asesor' && <Asesor {...comun} />}
      {efectivo && <HojaEfectivo caja={d.cuentas.find(c => c.tipo === 'efectivo')} d={d} alCerrar={() => setEfectivo(false)} editar={editar} recargar={recargar} avisar={avisar} />}
      <HojaClasificar clasificando={clasificando} d={d} op={op} crearOpcion={crearOpcion} alCerrar={() => setClasificando(null)} recargar={recargar} avisar={avisar} alSiguiente={(id) => setClasificando(c => ({ ...c, id }))} />
      <HojaEditar editando={editando} d={d} op={op} crearOpcion={crearOpcion} alCerrar={() => setEditando(null)} guardar={guardar} borrar={borrar} avisar={avisar} recargar={recargar} />
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import Segmentos from '../../componentes/Segmentos.jsx'
import Boton from '../../componentes/Boton.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import { Landmark } from 'lucide-react'
import { useDatos } from '../../estado/useDatos.jsx'
import * as fin from '../../datos/finanzas.js'
import { resumen, proyeccion } from '../../datos/finanzasCalculos.js'
import Resumen from './Resumen.jsx'
import Plan from './Plan.jsx'
import Libro from './Libro.jsx'
import Asesor from './Asesor.jsx'
import HojaEditar from './HojaEditar.jsx'
import './finanzas.css'

const VISTAS = [
  { valor: 'resumen', etiqueta: 'Resumen' },
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

  const recargar = useCallback(async () => {
    try { setD(await fin.cargar()); setError(null) } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { recargar() }, [recargar])
  useEffect(() => { try { localStorage.setItem('fin-vista', vista) } catch { /* sin almacenamiento */ } }, [vista])

  const calc = useMemo(() => (d ? { r: resumen(d), p: proyeccion(d) } : null), [d])

  // una sola puerta de escritura: guarda, avisa y recarga
  const guardar = useCallback(async (tabla, fila, texto = 'Guardado') => {
    try { await fin.guardar(tabla, fila); if (texto) avisar(texto); await recargar(); return true } catch (e) { avisar(e.message, 'error'); return false }
  }, [avisar, recargar])
  const borrar = useCallback(async (tabla, id) => {
    try { await fin.borrar(tabla, id); avisar('Borrado'); await recargar(); return true } catch (e) { avisar(e.message, 'error'); return false }
  }, [avisar, recargar])

  const editar = (tipo, fila = {}) => setEditando({ tipo, fila })

  if (error && !d) {
    return (
      <div className="pantalla">
        <Vacio icono={Landmark} titulo="Finanzas no responde" texto={error} accion={<Boton variante="secundario" onClick={recargar}>Reintentar</Boton>} />
      </div>
    )
  }
  if (!d) return <div className="pantalla"><div className="fz-cargando">Leyendo tus cuentas…</div></div>

  const comun = { d, calc, guardar, borrar, editar, recargar, avisar }
  return (
    <div className="pantalla fz">
      <Segmentos opciones={VISTAS} valor={vista} alCambiar={setVista} className="fz-vistas" />
      {vista === 'resumen' && <Resumen {...comun} />}
      {vista === 'plan' && <Plan {...comun} />}
      {vista === 'libro' && <Libro {...comun} />}
      {vista === 'asesor' && <Asesor {...comun} />}
      <HojaEditar editando={editando} d={d} alCerrar={() => setEditando(null)} guardar={guardar} borrar={borrar} avisar={avisar} recargar={recargar} />
    </div>
  )
}

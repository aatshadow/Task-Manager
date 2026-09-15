import { CloudOff } from 'lucide-react'
import Boton from '../../componentes/Boton.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import { useDatos } from '../../estado/useDatos.jsx'

/**
 * Lo que va en el hueco de la lista cuando todavía no hay tareas en memoria: «Cargando…»
 * mientras arranca, o el fallo con «Reintentar». Sin esto, la lista pintaría «Nada para
 * este día» sobre un array vacío que aún no significa nada (mismo patrón que Hoy).
 */
export default function EstadoCarga({ estado }) {
  const { error, recargar } = useDatos()
  if (estado === 'cargando') return <p className="cal-cargando t-terciario" role="status">Cargando…</p>
  if (estado === 'error') {
    return (
      <Vacio
        icono={CloudOff}
        titulo="No se pudieron cargar las tareas"
        texto={error?.message || 'Comprueba la conexión y vuelve a intentarlo.'}
        accion={<Boton variante="secundario" pequeno onClick={() => recargar()}>Reintentar</Boton>}
      />
    )
  }
  return null
}

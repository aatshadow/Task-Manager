import { Flag } from 'lucide-react'
import Frentes from '../Hoy/Frentes.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import { useDatos } from '../../estado/useDatos.jsx'

// Frentes como sección de Trabajo (LOGICA §18.1): los hitos de los lanzamientos, que antes
// iban al final de Hoy. Mismo componente; aquí con su estado vacío.
export default function PantallaFrentes() {
  const { hitos } = useDatos()
  const vivos = (hitos || []).filter((h) => !h.hecho)
  return (
    <div className="pantalla">
      {vivos.length
        ? <Frentes />
        : <Vacio icono={Flag} titulo="Sin frentes abiertos" texto="Los hitos se crean en Calendario → Gantt o con «2day frente»." />}
    </div>
  )
}

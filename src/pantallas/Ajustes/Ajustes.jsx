import './ajustes.css'
import { useDatos } from '../../estado/useDatos.jsx'
import SeccionProyectos from './SeccionProyectos.jsx'
import SeccionCategorias from './SeccionCategorias.jsx'
import SeccionPipelines from './SeccionPipelines.jsx'
import SeccionCuadrantes from './SeccionCuadrantes.jsx'
import SeccionPlantillas from './SeccionPlantillas.jsx'
import SeccionDia from './SeccionDia.jsx'
import SeccionCuenta from './SeccionCuenta.jsx'

/**
 * Ajustes (LOGICA §5): se abre desde el avatar y la flecha de la cabecera (App.jsx) vuelve
 * a la pestaña anterior. Una tarjeta por sección, en el orden del contrato; cada cambio
 * guarda al instante y, si falla, se deshace y sale el <Aviso/> global.
 */
export default function Ajustes() {
  const { cargando } = useDatos()
  // Se puede llegar desde el avatar con el arranque aún en vuelo: hasta que lleguen los
  // catálogos no se pintan las secciones, que con listas vacías mentirían («Sin proyectos»).
  if (cargando) {
    return (
      <div className="pantalla ajustes">
        <p className="t-secundario ajustes-cargando">Cargando…</p>
      </div>
    )
  }
  return (
    <div className="pantalla ajustes">
      <SeccionProyectos />
      <SeccionCategorias />
      <SeccionPipelines />
      <SeccionCuadrantes />
      <SeccionPlantillas />
      <SeccionDia />
      <SeccionCuenta />
    </div>
  )
}

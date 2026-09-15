import Tarjeta from '../../componentes/Tarjeta.jsx'
import Chip from '../../componentes/Chip.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as catalogos from '../../datos/catalogos.js'
import { usarGuardarCatalogo, EntradaInline, Color } from './comun.jsx'

/**
 * Eisenhower fijo: cuatro cuadrantes, etiqueta y color editables (decisión 5). Se guarda
 * el jsonb entero de `hoy_ajustes.cuadrantes`; la fila de ajustes tiene setter en el
 * contexto, así que no hace falta recargar catálogos.
 */
export default function SeccionCuadrantes() {
  const { cuadrantes, listaCuadrantes, setAjustes } = useDatos()
  const guardar = usarGuardarCatalogo()

  const editar = (clave, cambios) => {
    const nuevos = { ...cuadrantes, [clave]: { ...cuadrantes[clave], ...cambios } }
    // Optimista: el contexto deriva `cuadrantes` de `ajustes`, así que basta con parchearlo.
    setAjustes((a) => (a ? { ...a, cuadrantes: nuevos } : a))
    guardar(async () => { setAjustes(await catalogos.guardarAjustes({ cuadrantes: nuevos })) }, {
      catalogos: false,
      alFallar: () => setAjustes((a) => (a ? { ...a, cuadrantes } : a)),
    })
  }

  return (
    <section className="seccion">
      <div className="seccion-titulo">Cuadrantes</div>
      <Tarjeta>
        <ul className="ajustes-lista">
          {listaCuadrantes.map((q) => (
            <li key={q.clave} className="ajustes-fila">
              <Color valor={q.color} alCambiar={(color) => editar(q.clave, { color })} etiqueta={`Color de ${q.nombre}`} />
              <EntradaInline valor={q.nombre} alGuardar={(nombre) => editar(q.clave, { nombre })} aria-label={`Etiqueta de ${q.clave}`} />
              <Chip pequeno punto={false} color="var(--texto-2)">{q.clave.toUpperCase()}</Chip>
            </li>
          ))}
        </ul>
        <p className="ajustes-ayuda">Al crear una tarea de GrowthInfo el cuadrante se traduce una vez a prioridad (Q1 urgente · Q2 alta · Q3 media · Q4 baja).</p>
      </Tarjeta>
    </section>
  )
}

import { useState } from 'react'
import { LogOut } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Boton from '../../componentes/Boton.jsx'
import { useDatos } from '../../estado/useDatos.jsx'

/** Cuenta: el email de la sesión y Salir. La ficha de equipo, si la hay, se enseña debajo. */
export default function SeccionCuenta() {
  const { sesion, yo, salir, avisar } = useDatos()
  const [saliendo, setSaliendo] = useState(false)

  const cerrarSesion = async () => {
    setSaliendo(true)
    try {
      await salir()
    } catch (e) {
      avisar(e?.message || 'No se pudo salir', 'error')
      setSaliendo(false)
    }
  }

  return (
    <section className="seccion">
      <div className="seccion-titulo">Cuenta</div>
      <Tarjeta>
        <div className="ajustes-cuenta">
          <div className="ajustes-cuenta-email">
            <div>{sesion?.user?.email || '—'}</div>
            <div className="t-terciario">{yo ? `${yo.nombre}${yo.rol ? ` · ${yo.rol}` : ''} en GrowthInfo` : 'Sin ficha de equipo en GrowthInfo'}</div>
          </div>
          <Boton variante="secundario" pequeno icono={<LogOut size={16} strokeWidth={1.75} />} onClick={cerrarSesion} cargando={saliendo}>Salir</Boton>
        </div>
      </Tarjeta>
    </section>
  )
}

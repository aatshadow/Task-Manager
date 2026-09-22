import { useMemo } from 'react'
import { Flag } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Marca from '../../componentes/Marca.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { actualizarHito, ordenarHitos, textoHito, urgente } from '../../datos/hitos.js'

/**
 * Los frentes (LOGICA §10.5): los hitos con «en 3 días» / «hoy» / «hace 2 días» /
 * «sin fecha», en rojo si quedan ≤ 3 días. Marcar hecho lo quita de aquí (sigue en
 * Ajustes → Frentes). Optimista, como todo.
 */
export default function Frentes() {
  const { hitos, hoy, setHitos, avisar } = useDatos()
  const vivos = useMemo(() => ordenarHitos((hitos || []).filter((h) => !h.hecho), hoy), [hitos, hoy])
  if (!vivos.length) return null

  const marcarHecho = async (hito, hecho) => {
    setHitos((hs) => hs.map((h) => (h.id === hito.id ? { ...h, hecho } : h)))
    try {
      const real = await actualizarHito(hito.id, { hecho })
      if (real) setHitos((hs) => hs.map((h) => (h.id === hito.id ? real : h)))
    } catch (e) {
      setHitos((hs) => hs.map((h) => (h.id === hito.id ? hito : h)))
      avisar(e.message || 'No se pudo guardar el hito', 'error')
    }
  }

  return (
    <section className="seccion">
      <div className="seccion-titulo">Frentes</div>
      <Tarjeta className="frentes">
        {vivos.map((h) => {
          const rojo = urgente(h, hoy)
          return (
            <div key={h.id} className={`frente${rojo ? ' frente--urgente' : ''}`}>
              <span className="frente-icono" aria-hidden="true"><Flag size={16} strokeWidth={1.75} /></span>
              <span className="frente-textos">
                <span className="frente-nombre">{h.frente || h.nombre}</span>
                <span className="frente-hito">{h.frente ? h.nombre : ''}</span>
              </span>
              <span className="frente-cuando">{textoHito(h, hoy)}</span>
              <Marca hecha={false} alCambiar={(si) => marcarHecho(h, si)} aria-label={`Hecho: ${h.nombre}`} />
            </div>
          )
        })}
      </Tarjeta>
    </section>
  )
}

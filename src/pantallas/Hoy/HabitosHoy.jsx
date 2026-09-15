import { useMemo } from 'react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Marca from '../../componentes/Marca.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { tocaHoy, marcar } from '../../datos/habitos.js'

/**
 * Los hábitos que tocan hoy, con su marca. Un día que no toca no aparece (LOGICA §3.6:
 * no es un fallo, así que ni se enseña). La marca se pinta al instante y se escribe
 * después; si falla, se deshace y se avisa. Sin recarga: `marcas` vive en el contexto y
 * `marcar()` ya devuelve la fila escrita.
 */
export default function HabitosHoy() {
  const { habitos, marcas, hoy, setMarcas, avisar } = useDatos()

  const deHoy = useMemo(() => (habitos || []).filter((h) => !h.archivadoEn && tocaHoy(h, hoy)), [habitos, hoy])
  const marcados = useMemo(() => new Set((marcas || []).filter((m) => m.fecha === hoy).map((m) => m.habitoId)), [marcas, hoy])

  if (!deHoy.length) return null

  const cambiar = async (h, si) => {
    const esEsta = (m) => m.habitoId === h.id && m.fecha === hoy
    // se guarda sólo la marca de ESTE hábito: si la escritura falla se repone ella sola,
    // sin pisar lo que se haya marcado en otros hábitos mientras tanto
    const marcaAnterior = (marcas || []).find(esEsta) || null
    // optimista: la marca local basta para pintar; la real la sustituye al volver
    setMarcas((ms) => si
      ? [...ms.filter((m) => !esEsta(m)), { habitoId: h.id, fecha: hoy, nota: '', marcadoEn: new Date().toISOString() }]
      : ms.filter((m) => !esEsta(m)))
    try {
      const real = await marcar(h.id, hoy, si)
      if (real) setMarcas((ms) => ms.map((m) => (esEsta(m) ? real : m)))
    } catch (e) {
      setMarcas((ms) => {
        const sinEsta = ms.filter((m) => !esEsta(m))
        return marcaAnterior ? [...sinEsta, marcaAnterior] : sinEsta
      })
      avisar(e.message || 'No se pudo marcar el hábito', 'error')
    }
  }

  return (
    <section className="seccion">
      <div className="seccion-titulo">Hábitos de hoy</div>
      <Tarjeta className="hoy-habitos">
        {deHoy.map((h) => {
          const hecho = marcados.has(h.id)
          return (
            <div key={h.id} className={`hoy-habito${hecho ? ' hoy-habito--hecho' : ''}`} style={{ '--habito-color': h.color }}>
              <span className="hoy-habito-icono" aria-hidden="true">{h.icono || '•'}</span>
              <span className="hoy-habito-nombre">{h.nombre}</span>
              <Marca hecha={hecho} color={h.color} alCambiar={(si) => cambiar(h, si)} aria-label={h.nombre} />
            </div>
          )
        })}
      </Tarjeta>
    </section>
  )
}

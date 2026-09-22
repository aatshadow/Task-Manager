import { useMemo, useState } from 'react'
import { Eye, EyeOff, Plus, RotateCcw, Trash2 } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Boton from '../../componentes/Boton.jsx'
import Campo from '../../componentes/Campo.jsx'
import Selector from '../../componentes/Selector.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as datosBloques from '../../datos/bloques.js'
import { FASES, colorBloque } from '../../datos/bloques.js'
import { aMinutos } from '../../datos/fechas.js'
import { Confirmar, EntradaInline, MiniBoton, Orden, moverEn, sincronizarPosiciones, usarCola, usarGuardarCatalogo, usarListaOptimista } from './comun.jsx'
import { LETRAS_DIA } from '../Habitos/RejillaHabito.jsx'

/**
 * El Protocolo (LOGICA §10.1): el raíl de bloques del día. Cada fila: nombre editable,
 * fase, horas, los días L–D como chips, activar/desactivar, reordenar y borrar. Abajo,
 * «Restaurar el protocolo», que vuelve a dejar bloques y hábitos como dicta §10 sin tocar
 * ninguna marca.
 *
 * Mismo patrón que el resto de Ajustes: se pinta al instante sobre una copia local, se
 * escribe, y la recarga de catálogos deja la lista alineada; si falla, se vuelve atrás.
 */
export default function SeccionProtocolo() {
  const { bloques, recargar, avisar } = useDatos()
  const guardar = usarGuardarCatalogo()
  const encolar = usarCola()
  const ordenados = useMemo(() => [...(bloques || [])].sort((a, b) => (a.posicion - b.posicion) || (aMinutos(a.inicio) - aMinutos(b.inicio))), [bloques])
  const [lista, setLista] = usarListaOptimista(ordenados)
  const [nuevo, setNuevo] = useState(null)      // null | { nombre, fase, inicio, fin, dias }
  const [borrando, setBorrando] = useState(null)
  const [restaurando, setRestaurando] = useState(false)

  const escribir = (id, cambios, parche) => {
    setLista((l) => l.map((b) => (b.id === id ? { ...b, ...parche } : b)))
    return guardar(() => datosBloques.actualizarBloque(id, cambios))
  }

  const mover = (i, delta) => {
    const nueva = moverEn(lista, i, delta)
    if (nueva === lista) return
    setLista(nueva)
    encolar(() => sincronizarPosiciones(nueva, (id, posicion) => datosBloques.actualizarBloque(id, { posicion })))
  }

  const crear = async () => {
    const n = { ...nuevo, nombre: (nuevo.nombre || '').trim() }
    if (!n.nombre) { avisar('Ponle un nombre al bloque', 'error'); return }
    if (!n.inicio || !n.fin) { avisar('Un bloque necesita hora de inicio y de fin', 'error'); return }
    const r = await guardar(() => datosBloques.crearBloque(n), { exito: `Bloque «${n.nombre}» creado` })
    if (r) setNuevo(null)
  }

  const borrar = async (b) => {
    const r = await guardar(() => datosBloques.borrarBloque(b.id), { exito: `Bloque «${b.nombre}» borrado` })
    if (r) setBorrando(null)
  }

  const restaurar = async () => {
    setRestaurando(false)
    await guardar(async () => { await datosBloques.restaurarProtocolo(); await recargar() }, { exito: 'Protocolo restaurado' })
  }

  return (
    <section className="seccion seccion--ancha">
      <div className="seccion-titulo">Protocolo · el raíl del día</div>
      <Tarjeta>
        <div className="ajustes-lista">
          {lista.length === 0 && <p className="t-terciario">Sin bloques. Restaura el protocolo o añade el primero.</p>}
          {lista.map((b, i) => (
            <div key={b.id} className={`bloque-fila${b.activo ? '' : ' bloque-fila--apagado'}`} style={{ '--bloque-color': colorBloque(b) }}>
              <span className="bloque-barra" aria-hidden="true" />
              <div className="bloque-cuerpo">
                <EntradaInline valor={b.nombre} alGuardar={(nombre) => escribir(b.id, { nombre }, { nombre })} aria-label={`Nombre de ${b.nombre}`} />
                <div className="bloque-meta">
                  <input className="bloque-hora" type="time" value={b.inicio} onChange={(e) => escribir(b.id, { inicio: e.target.value }, { inicio: e.target.value })} aria-label="Hora de inicio" />
                  <span className="t-terciario">–</span>
                  <input className="bloque-hora" type="time" value={b.fin} onChange={(e) => escribir(b.id, { fin: e.target.value }, { fin: e.target.value })} aria-label="Hora de fin" />
                  <select className="bloque-fase" value={b.fase} onChange={(e) => escribir(b.id, { fase: e.target.value }, { fase: e.target.value })} aria-label="Fase">
                    {FASES.map((f) => <option key={f.clave} value={f.clave}>{f.nombre}</option>)}
                  </select>
                </div>
                <div className="bloque-dias" role="group" aria-label="Días">
                  {LETRAS_DIA.map((l, k) => {
                    const d = k + 1
                    const activo = (b.dias || []).includes(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        className={`bloque-dia${activo ? ' bloque-dia--activo' : ''}`}
                        aria-pressed={activo}
                        aria-label={`${l} ${activo ? 'sí' : 'no'}`}
                        onClick={() => {
                          const dias = activo ? b.dias.filter((x) => x !== d) : [...(b.dias || []), d].sort()
                          escribir(b.id, { dias }, { dias })
                        }}
                      >
                        {l}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="ajustes-acciones">
                <Orden arriba={() => mover(i, -1)} abajo={() => mover(i, 1)} puedeSubir={i > 0} puedeBajar={i < lista.length - 1} />
                <MiniBoton
                  icono={b.activo ? <Eye size={16} strokeWidth={1.75} /> : <EyeOff size={16} strokeWidth={1.75} />}
                  etiqueta={b.activo ? 'Desactivar' : 'Activar'}
                  onClick={() => escribir(b.id, { activo: !b.activo }, { activo: !b.activo })}
                />
                <MiniBoton icono={<Trash2 size={16} strokeWidth={1.75} />} etiqueta="Borrar" peligro onClick={() => setBorrando(b)} />
              </div>
              {borrando?.id === b.id && (
                <Confirmar
                  texto={`¿Borrar el bloque «${b.nombre}»? Los hábitos que colgaban de él se quedan sin bloque.`}
                  alConfirmar={() => borrar(b)}
                  alCancelar={() => setBorrando(null)}
                />
              )}
            </div>
          ))}
        </div>

        {nuevo ? (
          <div className="ajustes-nuevo">
            <Campo etiqueta="Nombre" valor={nuevo.nombre} alCambiar={(v) => setNuevo({ ...nuevo, nombre: v })} placeholder="Inmersión total" autoFocus />
            <div className="rejilla-2">
              <Campo etiqueta="Desde" type="time" valor={nuevo.inicio} alCambiar={(v) => setNuevo({ ...nuevo, inicio: v })} />
              <Campo etiqueta="Hasta" type="time" valor={nuevo.fin} alCambiar={(v) => setNuevo({ ...nuevo, fin: v })} />
            </div>
            <Selector
              etiqueta="Fase"
              modo="desplegable"
              valor={nuevo.fase}
              alCambiar={(v) => setNuevo({ ...nuevo, fase: v })}
              opciones={FASES.map((f) => ({ valor: f.clave, etiqueta: f.nombre }))}
            />
            <div className="bloque-dias" role="group" aria-label="Días">
              {LETRAS_DIA.map((l, k) => {
                const d = k + 1
                const activo = nuevo.dias.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    className={`bloque-dia${activo ? ' bloque-dia--activo' : ''}`}
                    aria-pressed={activo}
                    onClick={() => setNuevo({ ...nuevo, dias: activo ? nuevo.dias.filter((x) => x !== d) : [...nuevo.dias, d].sort() })}
                  >
                    {l}
                  </button>
                )
              })}
            </div>
            <div className="fila" style={{ justifyContent: 'flex-end' }}>
              <Boton variante="fantasma" pequeno onClick={() => setNuevo(null)}>Cancelar</Boton>
              <Boton pequeno onClick={crear}>Añadir</Boton>
            </div>
          </div>
        ) : (
          <div className="fila ajustes-pie">
            <Boton variante="secundario" pequeno icono={<Plus size={18} strokeWidth={1.75} />} onClick={() => setNuevo({ nombre: '', fase: 'ofensiva', inicio: '08:00', fin: '09:00', dias: [1, 2, 3, 4, 5] })}>
              Bloque
            </Boton>
            <span className="espacio" />
            {restaurando ? (
              <Confirmar
                texto="Restaurar deja los 22 bloques y los hábitos del Protocolo como dicta LOGICA §10. Tus marcas no se tocan."
                etiqueta="Restaurar"
                alConfirmar={restaurar}
                alCancelar={() => setRestaurando(false)}
              />
            ) : (
              <Boton variante="fantasma" pequeno icono={<RotateCcw size={16} strokeWidth={1.75} />} onClick={() => setRestaurando(true)}>
                Restaurar el protocolo
              </Boton>
            )}
          </div>
        )}
      </Tarjeta>
    </section>
  )
}

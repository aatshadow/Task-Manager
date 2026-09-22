import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Boton from '../../componentes/Boton.jsx'
import Campo from '../../componentes/Campo.jsx'
import Marca from '../../componentes/Marca.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as datosHitos from '../../datos/hitos.js'
import { ordenarHitos, textoHito } from '../../datos/hitos.js'
import { Confirmar, EntradaInline, MiniBoton, usarGuardarCatalogo } from './comun.jsx'

/**
 * Los frentes (LOGICA §10.5): un hito por lanzamiento, con su frente y su fecha (que
 * puede no existir todavía). Lo que se marca hecho desaparece de Hoy pero sigue aquí.
 */
export default function SeccionFrentes() {
  const { hitos, hoy, setHitos, recargar } = useDatos()
  const guardar = usarGuardarCatalogo()
  const lista = useMemo(() => ordenarHitos(hitos, hoy), [hitos, hoy])
  const [nuevo, setNuevo] = useState(null)
  const [borrando, setBorrando] = useState(null)

  const escribir = (h, cambios) => {
    setHitos((hs) => hs.map((x) => (x.id === h.id ? { ...x, ...cambios } : x)))
    return guardar(async () => { await datosHitos.actualizarHito(h.id, cambios); await recargar() }, { catalogos: false })
  }
  const crear = async () => {
    if (!nuevo.nombre.trim()) return
    const r = await guardar(async () => { await datosHitos.crearHito({ ...nuevo, nombre: nuevo.nombre.trim(), frente: nuevo.frente.trim(), fecha: nuevo.fecha || null }); await recargar() }, { catalogos: false, exito: 'Hito creado' })
    if (r) setNuevo(null)
  }
  const borrar = async (h) => {
    const r = await guardar(async () => { await datosHitos.borrarHito(h.id); await recargar() }, { catalogos: false, exito: 'Hito borrado' })
    if (r) setBorrando(null)
  }

  return (
    <section className="seccion">
      <div className="seccion-titulo">Frentes</div>
      <Tarjeta>
        <div className="ajustes-lista">
          {lista.length === 0 && <p className="t-terciario">Sin hitos. Añade el primer lanzamiento.</p>}
          {lista.map((h) => (
            <div key={h.id} className={`hito-fila${h.hecho ? ' hito-fila--hecho' : ''}`}>
              <Marca hecha={h.hecho} alCambiar={(si) => escribir(h, { hecho: si })} aria-label={`Hecho: ${h.nombre}`} />
              <div className="hito-cuerpo">
                <EntradaInline valor={h.frente} alGuardar={(frente) => escribir(h, { frente })} vacioVale aria-label="Frente" placeholder="Frente" className="hito-frente" />
                <EntradaInline valor={h.nombre} alGuardar={(nombre) => escribir(h, { nombre })} aria-label="Hito" className="hito-nombre" />
                <div className="hito-meta">
                  <input className="bloque-hora" type="date" value={h.fecha || ''} onChange={(e) => escribir(h, { fecha: e.target.value || null })} aria-label="Fecha" />
                  <span className="t-terciario">{textoHito(h, hoy)}</span>
                </div>
              </div>
              <div className="ajustes-acciones">
                <MiniBoton icono={<Trash2 size={16} strokeWidth={1.75} />} etiqueta="Borrar" peligro onClick={() => setBorrando(h)} />
              </div>
              {borrando?.id === h.id && (
                <Confirmar texto={`¿Borrar «${h.nombre}»?`} alConfirmar={() => borrar(h)} alCancelar={() => setBorrando(null)} />
              )}
            </div>
          ))}
        </div>

        {nuevo ? (
          <div className="ajustes-nuevo">
            <Campo etiqueta="Frente" valor={nuevo.frente} alCambiar={(v) => setNuevo({ ...nuevo, frente: v })} placeholder="Alberto Chan" autoFocus />
            <Campo etiqueta="Hito" valor={nuevo.nombre} alCambiar={(v) => setNuevo({ ...nuevo, nombre: v })} placeholder="Lanzamiento" />
            <Campo etiqueta="Fecha" type="date" valor={nuevo.fecha} alCambiar={(v) => setNuevo({ ...nuevo, fecha: v })} ayuda="Se puede dejar vacía" />
            <div className="fila" style={{ justifyContent: 'flex-end' }}>
              <Boton variante="fantasma" pequeno onClick={() => setNuevo(null)}>Cancelar</Boton>
              <Boton pequeno onClick={crear}>Añadir</Boton>
            </div>
          </div>
        ) : (
          <div className="ajustes-pie">
            <Boton variante="secundario" pequeno icono={<Plus size={18} strokeWidth={1.75} />} onClick={() => setNuevo({ frente: '', nombre: '', fecha: '' })}>Hito</Boton>
          </div>
        )}
      </Tarjeta>
    </section>
  )
}

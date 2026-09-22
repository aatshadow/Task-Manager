import { useEffect, useMemo, useState } from 'react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Campo from '../../componentes/Campo.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as datosRetos from '../../datos/retos.js'
import { diaDelReto } from '../../datos/retos.js'
import { usarGuardarCatalogo } from './comun.jsx'

/**
 * El reto (LOGICA §10.0-4): nombre, inicio, fin y descripción, con el día actual N/90 en
 * grande. Sin reto, el formulario crea uno. Cada campo guarda al soltar el foco; el resto
 * de la app (la cabecera de Hoy, el mapa de calor de Stats) se recalcula solo.
 */
export default function SeccionReto() {
  const { reto, hoy, recargar } = useDatos()
  const guardar = usarGuardarCatalogo()
  const vacio = { nombre: 'Zero Agent Challenge', inicio: hoy, fin: '', descripcion: '' }
  const [form, setForm] = useState(() => (reto ? { ...reto } : vacio))
  useEffect(() => { setForm(reto ? { ...reto } : vacio) }, [reto]) // eslint-disable-line react-hooks/exhaustive-deps

  const estado = useMemo(() => diaDelReto(reto, hoy), [reto, hoy])

  const escribir = (cambios) => guardar(async () => { await datosRetos.guardarReto(reto?.id || null, cambios); await recargar() }, { catalogos: false })
  const soltar = (clave) => {
    const v = (form[clave] ?? '').trim?.() ?? form[clave]
    if (!reto) return
    if (v === (reto[clave] ?? '')) return
    if ((clave === 'inicio' || clave === 'fin') && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { setForm({ ...form, [clave]: reto[clave] }); return }
    if (clave === 'nombre' && !v) { setForm({ ...form, nombre: reto.nombre }); return }
    escribir({ [clave]: v })
  }
  const crear = () => {
    if (!form.nombre.trim() || !form.inicio || !form.fin) return
    escribir({ nombre: form.nombre.trim(), inicio: form.inicio, fin: form.fin, descripcion: form.descripcion })
  }

  return (
    <section className="seccion">
      <div className="seccion-titulo">Reto</div>
      <Tarjeta>
        {reto && (
          <div className="reto-ajustes-cabeza">
            <span className={`reto-ajustes-dia${estado.antes ? ' reto-ajustes-dia--texto' : ''}`}>
              {estado.antes ? `Empieza en ${estado.faltan} ${estado.faltan === 1 ? 'día' : 'días'}` : `${estado.dia} / ${estado.total}`}
            </span>
            <span className="t-terciario">{estado.terminado ? 'completado' : estado.antes ? reto.inicio : `hasta el ${reto.fin}`}</span>
          </div>
        )}
        <div className="columna" style={{ gap: 14 }}>
          <Campo etiqueta="Nombre" valor={form.nombre} alCambiar={(v) => setForm({ ...form, nombre: v })} onBlur={() => soltar('nombre')} placeholder="Zero Agent Challenge" />
          <div className="rejilla-2">
            <Campo etiqueta="Inicio" type="date" valor={form.inicio || ''} alCambiar={(v) => setForm({ ...form, inicio: v })} onBlur={() => soltar('inicio')} />
            <Campo etiqueta="Fin" type="date" valor={form.fin || ''} alCambiar={(v) => setForm({ ...form, fin: v })} onBlur={() => soltar('fin')} />
          </div>
          <Campo etiqueta="Descripción" valor={form.descripcion || ''} alCambiar={(v) => setForm({ ...form, descripcion: v })} onBlur={() => soltar('descripcion')} multilinea rows={2} placeholder="90 días de Protocolo." />
          {!reto && (
            <div className="fila" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="boton boton--primario boton--pequeno" onClick={crear}>Crear el reto</button>
            </div>
          )}
        </div>
      </Tarjeta>
    </section>
  )
}

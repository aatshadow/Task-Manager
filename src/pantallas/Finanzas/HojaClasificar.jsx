import { useEffect, useState } from 'react'
import { Sparkles, Check } from 'lucide-react'
import Hoja from '../../componentes/Hoja.jsx'
import Selector from '../../componentes/Selector.jsx'
import Boton from '../../componentes/Boton.jsx'
import { CLASES, formatear, patronDe, sentidoDe, porClasificar } from '../../datos/finanzasCalculos.js'
import { clasificarUno } from '../../datos/finanzas.js'

/**
 * Clasificar un movimiento de un toque (LOGICA §17.5). Si la IA dejó una propuesta, sale
 * marcada y basta con «Aceptar». Con «Siempre igual», 2day aprende la regla y la aplica a
 * todo lo parecido. En modo cola, al guardar salta al siguiente pendiente. Categoría y negocio
 * admiten «+ Nueva» (§17.6); la clase no, porque de ella sale el «hoy puedes gastar».
 */
const PERIODOS = [{ valor: 'mensual', etiqueta: 'Cada mes' }, { valor: 'anual', etiqueta: 'Cada año' }]
const aOpciones = (l) => l.map(v => ({ valor: v, etiqueta: v }))
const CLASES_GASTO = CLASES.filter(c => !['ingreso'].includes(c.valor))
const CLASES_ENTRADA = CLASES.filter(c => ['ingreso', 'interno', 'inversion'].includes(c.valor))

export default function HojaClasificar({ clasificando, d, op, crearOpcion, alCerrar, recargar, avisar, alSiguiente }) {
  const m = clasificando ? d.movimientos.find(x => x.id === clasificando.id) : null
  const [f, setF] = useState({})
  const [siempre, setSiempre] = useState(true)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!m) return
    const s = m.sugerencia || {}
    setF({
      clase: m.clase || s.clase || null, categoria: m.categoria || s.categoria || null, negocio: m.negocio || s.negocio || null,
      suscripcion: !!s.suscripcion, recurrencia: s.recurrencia || 'mensual',
    })
    setSiempre(true)
  }, [m?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) return <Hoja abierta={false} alCerrar={alCerrar} />
  const entrada = sentidoDe(m) === 'ingreso'
  const pendientes = d.movimientos.filter(porClasificar).length
  const patron = patronDe(m)
  const s = m.sugerencia

  const guardar = async (valores = f) => {
    if (!valores.clase || !valores.categoria) return avisar('Elige clase y categoría', 'error')
    setGuardando(true)
    try {
      const r = await clasificarUno({ id: m.id, ...valores, suscripcion: !entrada && valores.suscripcion, siempre: siempre && !!patron })
      avisar([r.iguales ? `Clasificado, y ${r.iguales} parecidos con él` : 'Clasificado', r.suscripcion && `suscripción «${r.suscripcion}» en próximos pagos`].filter(Boolean).join(' · '))
      const nuevo = await recargar()
      const siguiente = clasificando.cola ? nuevo?.movimientos.find(porClasificar) : null
      if (siguiente) alSiguiente(siguiente.id)
      else alCerrar()
    } catch (e) { avisar(e.message, 'error') } finally { setGuardando(false) }
  }

  const pie = (
    <>
      {clasificando.cola && <Boton variante="fantasma" onClick={() => {
        const otros = d.movimientos.filter(x => porClasificar(x) && x.id !== m.id)
        const i = otros.findIndex(x => x.fecha < m.fecha)
        const sig = otros[i >= 0 ? i : 0]
        if (sig) alSiguiente(sig.id); else alCerrar()
      }}>Saltar</Boton>}
      <Boton variante="primario" cargando={guardando} onClick={() => guardar()}>Guardar</Boton>
    </>
  )

  return (
    <Hoja abierta alCerrar={alCerrar} titulo={clasificando.cola ? `Por clasificar · ${pendientes}` : 'Clasificar'} pie={pie}>
      <div className="columna fz-formulario">
        <div className="fz-clas-mov">
          <div className="fz-clas-nombre">{m.contraparte || m.descripcion || 'Sin descripción'}</div>
          <div className={`fz-clas-importe ${entrada ? 'fz-mas' : ''}`}>{formatear(m.importe, { moneda: m.moneda, decimales: 2, signo: true })}</div>
          <div className="t-terciario">{new Date(`${m.fecha}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}{m.descripcion && m.contraparte ? ` · ${m.descripcion}` : ''}</div>
        </div>

        {s && (
          <div className="fz-propuesta fz-clas-ia">
            <Sparkles size={16} strokeWidth={1.7} />
            <div className="fz-clas-ia-texto">
              <strong>{s.categoria} · {CLASES.find(c => c.valor === s.clase)?.etiqueta}{s.negocio ? ` · ${s.negocio}` : ''}{s.suscripcion ? ' · suscripción' : ''}</strong>
              <span className="t-terciario">{s.motivo} ({Math.round((s.confianza || 0) * 100)} % seguro)</span>
            </div>
            <Boton variante="secundario" pequeno icono={<Check size={15} />} cargando={guardando}
              onClick={() => guardar({ clase: s.clase, categoria: s.categoria, negocio: s.negocio || null, suscripcion: !!s.suscripcion, recurrencia: s.recurrencia || 'mensual' })}>Aceptar</Boton>
          </div>
        )}

        <Selector etiqueta="Categoría" opciones={aOpciones(entrada ? op.ingreso : op.gasto)} valor={f.categoria ?? ''} alCambiar={v => setF(p => ({ ...p, categoria: v }))}
          alCrear={(n) => crearOpcion(entrada ? 'ingreso' : 'gasto', n)} textoNueva="Nueva categoría" />
        <Selector etiqueta="Clase" opciones={(entrada ? CLASES_ENTRADA : CLASES_GASTO).map(c => ({ valor: c.valor, etiqueta: c.etiqueta }))} valor={f.clase ?? ''} alCambiar={v => setF(p => ({ ...p, clase: v }))} />
        <Selector etiqueta="Negocio" opciones={aOpciones(op.negocios)} valor={f.negocio ?? ''} permitirVacio alCambiar={v => setF(p => ({ ...p, negocio: v || null }))}
          alCrear={(n) => crearOpcion('negocios', n)} textoNueva="Nuevo negocio" />

        {!entrada && (
          <>
            <label className="fz-si">
              <input type="checkbox" checked={!!f.suscripcion} onChange={e => setF(p => ({ ...p, suscripcion: e.target.checked }))} />
              <span>Es una suscripción: que salga en próximos pagos</span>
            </label>
            {f.suscripcion && <Selector opciones={PERIODOS} valor={f.recurrencia} alCambiar={v => setF(p => ({ ...p, recurrencia: v || 'mensual' }))} />}
          </>
        )}

        {patron && (
          <label className="fz-si">
            <input type="checkbox" checked={siempre} onChange={e => setSiempre(e.target.checked)} />
            <span>Siempre igual para «{patron}»: 2day lo aprende y lo hace solo</span>
          </label>
        )}
      </div>
    </Hoja>
  )
}

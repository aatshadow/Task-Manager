import { useEffect, useRef, useState } from 'react'
import { Sparkles, ShieldAlert, PiggyBank, TrendingUp, Wallet, Lock, Plus, Check, Send, HelpCircle } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Boton from '../../componentes/Boton.jsx'
import { formatear, AREAS } from '../../datos/finanzasCalculos.js'
import { pedirParte, preguntar } from '../../datos/finanzas.js'

const TIPOS = {
  obligatorio: { Icono: Lock, etiqueta: 'Sí o sí' },
  gasta: { Icono: Wallet, etiqueta: 'Puedes gastar' },
  ahorra: { Icono: PiggyBank, etiqueta: 'Ahorra' },
  invierte: { Icono: TrendingUp, etiqueta: 'Invierte' },
  aviso: { Icono: ShieldAlert, etiqueta: 'Aviso' },
}
const PRIORIDAD = { 1: 'Alta', 2: 'Media', 3: 'Baja' }

export default function Asesor({ d, guardar, editar, recargar, avisar }) {
  const [pidiendo, setPidiendo] = useState(false)
  const parte = d.partes[0]
  const deHoy = parte?.fecha === d.hoy

  const alPedir = async () => {
    setPidiendo(true)
    try { await pedirParte(); await recargar() } catch (e) { avisar(e.message, 'error') } finally { setPidiendo(false) }
  }

  const yaEnPlan = new Set(d.acciones.map(a => a.titulo.trim().toLowerCase()))
  const alternar = (a) => guardar('fin_acciones', { id: a.id, estado: a.estado === 'hecha' ? 'pendiente' : 'hecha' }, a.estado === 'hecha' ? 'Reabierta' : 'Hecha')

  return (
    <div className="fz-vista">
      <Tarjeta variante="calida" className="fz-parte">
        <div className="fz-seccion-cabeza">
          <div className="fz-micro"><Sparkles size={13} /> Parte del {deHoy ? 'día' : parte ? new Date(`${parte.fecha}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'día'}</div>
          <Boton variante={deHoy ? 'fantasma' : 'primario'} pequeno cargando={pidiendo} onClick={alPedir}>{parte ? 'Rehacer' : 'Pedir el parte'}</Boton>
        </div>
        {!d.bancos.ia && <div className="t-terciario">El servidor no tiene la clave de Anthropic: el asesor no puede escribir.</div>}
        {!parte && !pidiendo && <p className="fz-parte-lectura">El asesor lee tus cuentas, lo previsto, tus objetivos y el plan, y te dice qué es obligatorio, qué puedes gastar, qué ahorrar y qué invertir hoy.</p>}
        {pidiendo && <p className="fz-parte-lectura t-secundario">Leyendo tus números… (unos 30–60 s)</p>}
        {parte && !pidiendo && (
          <>
            <h2 className="fz-parte-titular">{parte.parte.titular}</h2>
            <p className="fz-parte-lectura">{parte.parte.lectura}</p>
            <div className="fz-consejos">
              {parte.parte.consejos.map((c, i) => {
                const { Icono, etiqueta } = TIPOS[c.tipo] || TIPOS.aviso
                return (
                  <div key={i} className={`fz-consejo fz-consejo--${c.tipo}`}>
                    <span className="fz-consejo-icono"><Icono size={15} strokeWidth={1.7} /></span>
                    <div>
                      <div className="fz-consejo-tipo">{etiqueta}{c.importe != null ? ` · ${formatear(c.importe)}` : ''}</div>
                      <div>{c.texto}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            {parte.parte.falta_saber?.length > 0 && (
              <div className="fz-falta-saber">
                <div className="fz-consejo-tipo"><HelpCircle size={13} /> Me falta saber</div>
                <ul>{parte.parte.falta_saber.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            )}
            {parte.parte.acciones?.filter(a => !yaEnPlan.has(a.titulo.trim().toLowerCase())).map((a, i) => (
              <div key={i} className="fz-propuesta">
                <div className="fz-fila-texto"><span>{a.titulo}</span><span className="t-terciario">{a.detalle}</span></div>
                <Boton variante="secundario" pequeno icono={<Plus size={15} />} onClick={() => guardar('fin_acciones', { ...a, origen: 'asesor' }, 'Añadida al plan')}>Plan</Boton>
              </div>
            ))}
          </>
        )}
      </Tarjeta>

      <section className="seccion">
        <div className="fz-seccion-cabeza">
          <h2 className="seccion-titulo">Plan de acción</h2>
          <Boton variante="secundario" pequeno icono={<Plus size={15} />} onClick={() => editar('accion', { area: 'finanzas', prioridad: 2 })}>Añadir</Boton>
        </div>
        {AREAS.map(area => {
          const items = d.acciones.filter(a => a.area === area.valor)
          if (!items.length) return null
          const hechas = items.filter(a => a.estado === 'hecha').length
          return (
            <div key={area.valor} className="fz-area">
              <div className="fz-area-cabeza"><span>{area.etiqueta}</span><span className="t-terciario">{hechas}/{items.length}</span></div>
              <Tarjeta compacta>
                {items.map(a => (
                  <div key={a.id} className={`fz-accion${a.estado === 'hecha' ? ' fz-accion--hecha' : ''}`}>
                    <button type="button" className="fz-check" aria-label={a.estado === 'hecha' ? 'Reabrir' : 'Marcar hecha'} onClick={() => alternar(a)}>
                      {a.estado === 'hecha' && <Check size={14} strokeWidth={2.4} />}
                    </button>
                    <button type="button" className="fz-fila-texto fz-accion-texto" onClick={() => editar('accion', a)}>
                      <span>{a.titulo}</span>
                      <span className="t-terciario">
                        {PRIORIDAD[a.prioridad]}{a.estado === 'en_curso' ? ' · en curso' : ''}{a.fecha ? ` · ${new Date(`${a.fecha}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : ''}{a.importe_estimado ? ` · ~${formatear(a.importe_estimado)}` : ''}
                      </span>
                    </button>
                  </div>
                ))}
              </Tarjeta>
            </div>
          )
        })}
      </section>

      <Chat d={d} recargar={recargar} avisar={avisar} />
    </div>
  )
}

function Chat({ d, recargar, avisar }) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(null) // la pregunta mientras responde
  const fin = useRef(null)
  useEffect(() => { fin.current?.scrollIntoView({ block: 'nearest' }) }, [d.chat.length, enviando])

  const enviar = async (e) => {
    e?.preventDefault()
    const q = texto.trim()
    if (!q || enviando) return
    setEnviando(q); setTexto('')
    try { await preguntar(q); await recargar() } catch (err) { avisar(err.message, 'error'); setTexto(q) } finally { setEnviando(null) }
  }

  return (
    <section className="seccion">
      <h2 className="seccion-titulo">Pregúntale</h2>
      <Tarjeta compacta className="fz-chat">
        {d.chat.length === 0 && !enviando && <div className="t-terciario fz-vacio-linea">«¿Me puedo permitir un MacBook de 3.000 €?» · «¿Cuánto aparto para Paraguay este mes?»</div>}
        {d.chat.map(m => <div key={m.id} className={`fz-msg fz-msg--${m.rol}`}>{m.texto}</div>)}
        {enviando && <><div className="fz-msg fz-msg--alex">{enviando}</div><div className="fz-msg fz-msg--asesor t-secundario">Pensando…</div></>}
        <div ref={fin} />
        <form className="fz-chat-caja" onSubmit={enviar}>
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Pregunta al asesor…" enterKeyHint="send" />
          <Boton type="submit" variante="primario" pequeno icono={<Send size={16} />} aria-label="Enviar" disabled={!texto.trim() || !!enviando} />
        </form>
      </Tarjeta>
    </section>
  )
}

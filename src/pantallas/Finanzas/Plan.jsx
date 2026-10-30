import { Plus, Target, Repeat } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Boton from '../../componentes/Boton.jsx'
import { aBase, formatear, suscripciones, diasEntre, RECURRENCIAS } from '../../datos/finanzasCalculos.js'

const fecha = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'sin fecha')
const nombreRec = (r) => RECURRENCIAS.find(x => x.valor === (r || ''))?.etiqueta.toLowerCase()

function Cabeza({ titulo, alAnadir, etiqueta }) {
  return (
    <div className="fz-seccion-cabeza">
      <h2 className="seccion-titulo">{titulo}</h2>
      {alAnadir && <Boton variante="secundario" pequeno icono={<Plus size={15} />} aria-label={etiqueta} onClick={alAnadir}>Añadir</Boton>}
    </div>
  )
}

function FilaPrevisto({ x, d, editar }) {
  const tasas = d.ajustes.tasas?.valores
  const base = x.importe == null ? null : aBase(x.importe, x.moneda, tasas)
  const prov = x.importe ? Math.min(1, (Number(x.provisionado) || 0) / Number(x.importe)) : 0
  const dias = x.fecha ? diasEntre(d.hoy, x.fecha) : null
  return (
    <button type="button" className="fz-fila fz-fila--alta" onClick={() => editar('previsto', x)}>
      <span className="fz-fila-texto">
        <span>{x.titulo}</span>
        <span className="t-terciario">
          {fecha(x.fecha)}{x.recurrencia ? ` · ${nombreRec(x.recurrencia)}` : dias != null && dias >= 0 ? ` · en ${dias} días` : ''}{x.estado !== 'previsto' ? ` · ${x.estado}` : ''}
        </span>
        {!x.recurrencia && x.importe > 0 && x.tipo === 'gasto' && (
          <span className="fz-barra fz-barra--fina"><span style={{ width: `${Math.max(1, prov * 100)}%` }} /></span>
        )}
      </span>
      <span className={`fz-fila-importe ${x.tipo === 'ingreso' ? 'fz-mas' : ''}`}>
        {base == null ? <span className="fz-falta">sin importe</span> : formatear(x.importe, { moneda: x.moneda })}
        {!x.recurrencia && x.importe > 0 && x.tipo === 'gasto' && <span className="t-terciario">{Math.round(prov * 100)} % apartado</span>}
      </span>
    </button>
  )
}

export default function Plan({ d, calc, editar }) {
  const tasas = d.ajustes.tasas?.valores
  const subs = suscripciones(d.previstos, tasas)
  const vivos = d.previstos.filter(p => p.estado === 'previsto' && !p.suscripcion)
  const gastos = vivos.filter(p => p.tipo === 'gasto')
  const ingresos = vivos.filter(p => p.tipo === 'ingreso')
  const cerrados = d.previstos.filter(p => p.estado !== 'previsto')

  return (
    <div className="fz-vista">
      <section>
        <Cabeza titulo="Objetivos" etiqueta="Añadir objetivo" alAnadir={() => editar('objetivo')} />
        <div className="fz-lista-tarjetas">
          {d.objetivos.map(o => {
            const meta = o.tipo === 'colchon' && !o.importe ? calc.r.colchon : aBase(o.importe, o.moneda, tasas)
            const pct = meta > 0 ? Math.min(1, calc.r.liquidez / meta) : 0
            return (
              <Tarjeta key={o.id} compacta variante={o.principal ? 'calida' : 'normal'} onClick={() => editar('objetivo', o)}>
                <div className="fz-objetivo">
                  <Target size={18} strokeWidth={1.6} className="fz-oro" />
                  <div className="fz-fila-texto">
                    <span>{o.titulo}{o.principal ? ' · principal' : ''}</span>
                    <span className="t-terciario">{o.fecha ? fecha(o.fecha) : o.tipo === 'colchon' ? `${d.ajustes.colchon_meses} meses de gasto fijo` : 'sin fecha'}</span>
                  </div>
                  <span className="fz-numero-medio">{meta ? formatear(meta) : '—'}</span>
                </div>
                {meta > 0 && o.tipo !== 'compra' && <div className="fz-barra fz-barra--fina"><span style={{ width: `${Math.max(0.6, pct * 100)}%` }} /></div>}
              </Tarjeta>
            )
          })}
        </div>
      </section>

      <section className="seccion">
        <Cabeza titulo="Gastos previstos" etiqueta="Añadir gasto previsto" alAnadir={() => editar('previsto', { tipo: 'gasto', clase: 'obligatorio' })} />
        <Tarjeta compacta>
          {gastos.length === 0 && <div className="t-terciario fz-vacio-linea">Nada previsto.</div>}
          {gastos.map(x => <FilaPrevisto key={x.id} x={x} d={d} editar={editar} />)}
        </Tarjeta>
      </section>

      <section className="seccion">
        <Cabeza titulo="Ingresos previstos" etiqueta="Añadir ingreso previsto" alAnadir={() => editar('previsto', { tipo: 'ingreso', clase: 'ingreso' })} />
        <Tarjeta compacta>
          {ingresos.length === 0 && <div className="t-terciario fz-vacio-linea">Apunta tus cobros recurrentes (clientes, cuotas) para que la proyección tenga ritmo.</div>}
          {ingresos.map(x => <FilaPrevisto key={x.id} x={x} d={d} editar={editar} />)}
        </Tarjeta>
      </section>

      <section className="seccion">
        <Cabeza titulo="Suscripciones" etiqueta="Añadir suscripción" alAnadir={() => editar('previsto', { tipo: 'gasto', clase: 'recortable', suscripcion: true, recurrencia: 'mensual' })} />
        <Tarjeta compacta>
          <div className="fz-subs-total">
            <Repeat size={16} strokeWidth={1.6} className="fz-oro" />
            <span>{formatear(subs.mensual)}<span className="t-terciario"> /mes</span></span>
            <span className="t-terciario">{formatear(subs.anual)} al año · {subs.lista.length === 1 ? '1 activa' : `${subs.lista.length} activas`}</span>
          </div>
          {subs.lista.map(x => <FilaPrevisto key={x.id} x={x} d={d} editar={editar} />)}
        </Tarjeta>
      </section>

      <section className="seccion">
        <Cabeza titulo="Reglas del dinero" />
        <Tarjeta compacta onClick={() => editar('ajustes', d.ajustes)}>
          <div className="fz-rejilla">
            <div><span className="t-terciario">Sueldo del dueño</span><strong>{Number(d.ajustes.sueldo_dueno) ? formatear(d.ajustes.sueldo_dueno) : 'sin fijar'}</strong></div>
            <div><span className="t-terciario">Colchón</span><strong>{d.ajustes.colchon_meses} meses</strong></div>
            <div><span className="t-terciario">Impuestos</span><strong>{d.ajustes.impuestos_pct} %</strong></div>
          </div>
          <div className="t-terciario fz-nota">Gasto fijo: {formatear(calc.r.fijoMes)}/mes (recurrentes obligatorios y recortables + sueldo).</div>
        </Tarjeta>
      </section>

      {cerrados.length > 0 && (
        <section className="seccion">
          <Cabeza titulo="Historial de previstos" />
          <Tarjeta compacta>{cerrados.map(x => <FilaPrevisto key={x.id} x={x} d={d} editar={editar} />)}</Tarjeta>
        </section>
      )}
    </div>
  )
}

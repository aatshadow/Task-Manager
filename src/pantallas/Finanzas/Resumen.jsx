import { useState } from 'react'
import { RefreshCw, Plus, AlertTriangle, ArrowDownRight, ArrowUpRight, Sparkles, Repeat } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Boton from '../../componentes/Boton.jsx'
import { aBase, formatear, diasEntre, porClasificar, CLASES, suscripciones, ocurrencias, sumarDias } from '../../datos/finanzasCalculos.js'
import { sincronizar, clasificar as pedirClasificacion } from '../../datos/finanzas.js'
import Proyeccion from './Proyeccion.jsx'

const SEMAFORO = { verde: 'En verde', ambar: 'Vas por detrás de la Misión', rojo: 'En rojo: hoy no hay margen' }
const fechaCorta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

export default function Resumen({ d, calc, editar, recargar, avisar, clasificar, irALibro }) {
  const { r, p } = calc
  const tasas = d.ajustes.tasas?.valores
  const [sincronizando, setSincronizando] = useState(false)
  const [pensando, setPensando] = useState(false)
  const pendientes = d.movimientos.filter(porClasificar)
  const sinPropuesta = pendientes.filter(m => !m.sugerencia).length
  const porIa = d.movimientos.filter(m => m.clasificado_por === 'ia').length
  // suscripciones (§17.6): cada una con su próximo cobro, sus cargos ya vistos y el último
  const subs = suscripciones(d.previstos, tasas)
  const listaSubs = subs.lista.map(p => {
    const cargos = d.movimientos.filter(m => m.previsto_id === p.id && m.estado !== 'cancelado')
    return { ...p, proximo: ocurrencias(p, d.hoy, sumarDias(d.hoy, 400))[0] || p.fecha, cargos: cargos.length, ultimo: cargos[0]?.fecha }
  }).sort((a, b) => (a.proximo || '9').localeCompare(b.proximo || '9'))

  const alPedirIa = async () => {
    setPensando(true)
    try {
      const c = await pedirClasificacion()
      avisar(`${c.reglas + c.ia} clasificados solos${c.dudas ? ` · ${c.dudas} con propuesta para que decidas` : ''}`)
      await recargar()
    } catch (e) { avisar(e.message, 'error') } finally { setPensando(false) }
  }

  const alSincronizar = async () => {
    setSincronizando(true)
    try {
      const s = await sincronizar()
      const malos = s.resultados.filter(x => !x.ok)
      const nuevos = s.resultados.reduce((n, x) => n + (x.nuevos || 0), 0)
      if (malos.length === s.resultados.length) avisar(malos.map(m => m.error).join(' · '), 'error')
      else avisar(`${nuevos} movimientos nuevos${s.internos ? ` · ${s.internos} transferencias internas` : ''}${s.clasificacion?.ia || s.clasificacion?.reglas ? ` · ${s.clasificacion.ia + s.clasificacion.reglas} clasificados solos` : ''}`)
      await recargar()
    } catch (e) { avisar(e.message, 'error') } finally { setSincronizando(false) }
  }

  const cascada = [
    { etiqueta: 'Caja y bancos', valor: r.liquidez },
    { etiqueta: 'Pagos previstos próximos 30 días', valor: -r.comprometido },
  ]
  const aut = r.autonomia
  const meses = (a) => (a.sostenible ? 'sostenible' : `${a.meses.toLocaleString('es-ES', { maximumFractionDigits: a.meses < 10 ? 1 : 0 })} ${a.meses >= 0.95 && a.meses < 1.05 ? 'mes' : 'meses'}`)
  const sync = d.ajustes.sync

  return (
    <div className="fz-vista">
      <Tarjeta variante="calida" className="fz-hero">
        <div className="fz-micro">Hoy puedes gastar</div>
        <div className={`fz-hero-numero${r.hoyPuedes < 0 ? ' fz-hero-numero--rojo' : ''}`}>{formatear(Math.max(0, r.hoyPuedes))}</div>
        <div className="fz-hero-pie">
          <span className={`fz-semaforo fz-semaforo--${r.semaforo}`}><i />{SEMAFORO[r.semaforo]}</span>
          {r.gastadoHoy > 0 && <span className="t-secundario">ya llevas {formatear(r.gastadoHoy)} libres hoy</span>}
        </div>
        <div className="fz-cascada">
          {cascada.map(c => (
            <div key={c.etiqueta} className="fz-cascada-fila">
              <span>{c.etiqueta}</span>
              <span className={c.valor < 0 ? 'fz-menos' : ''}>{formatear(c.valor)}</span>
            </div>
          ))}
          <div className="fz-cascada-fila fz-cascada-total">
            <span>Disponible 30 días</span>
            <span>{formatear(r.disponible)}</span>
          </div>
          {r.ingresosPrevistos > 0 && (
            <div className="fz-cascada-nota">Si entran los {formatear(r.ingresosPrevistos)} previstos, sube a {formatear(Math.max(0, r.conIngresos))}/día.</div>
          )}
        </div>
        <div className="fz-autonomia">
          <div className="fz-micro">Autonomía</div>
          <div className="fz-autonomia-numero">{aut.sostenible ? '∞' : aut.meses.toLocaleString('es-ES', { maximumFractionDigits: aut.meses < 10 ? 1 : 0 })}<span>{aut.sostenible ? 'sostenible' : aut.meses >= 0.95 && aut.meses < 1.05 ? 'mes' : 'meses'}</span></div>
          <div className="fz-cascada-nota">
            {aut.sostenible
              ? 'Con lo previsto, la caja no llega a cero en los próximos 5 años.'
              : `Con la caja de hoy y lo previsto (gastos, ingresos${r.sueldo ? ' y tu sueldo' : ''}), llega a cero el ${new Date(`${aut.cae}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.`}
          </div>
          {r.autonomiaConDeuda && (
            <div className="fz-cascada-nota">
              {r.autonomiaConDeuda.dias === 0
                ? `La deuda a corto plazo (${formatear(r.deudaCorta)}) no se puede pagar entera con la caja de hoy.`
                : `Si pagas hoy la deuda a corto plazo (${formatear(r.deudaCorta)}): ${meses(r.autonomiaConDeuda)}.`}
            </div>
          )}
          {r.quemaReal != null && (
            <div className="fz-cascada-nota">
              {r.quemaReal > 0
                ? `Al ritmo real de los últimos 30 días (${formatear(r.quemaReal)}/mes netos de salida): ${r.autonomiaReal.toLocaleString('es-ES', { maximumFractionDigits: 1 })} meses.`
                : `Al ritmo real de los últimos 30 días la caja crece ${formatear(-r.quemaReal)}/mes.`}
            </div>
          )}
        </div>
      </Tarjeta>

      {r.sinDatos && (
        <Tarjeta className="fz-aviso">
          <AlertTriangle size={18} strokeWidth={1.7} />
          <div>
            <strong>Aún no hay ninguna cuenta.</strong> Conecta Mercury y Wise (tokens de sólo lectura en Vercel) o apunta tus saldos a mano: sin liquidez, el número del día no dice nada.
          </div>
        </Tarjeta>
      )}
      {r.sinImporte.length > 0 && (
        <Tarjeta className="fz-aviso" onClick={() => editar('previsto', r.sinImporte[0])}>
          <AlertTriangle size={18} strokeWidth={1.7} />
          <div><strong>Previstos sin importe:</strong> {r.sinImporte.map(x => x.titulo).join(' · ')}. Ponles cifra para que cuenten.</div>
        </Tarjeta>
      )}

      {pendientes.length > 0 && (
        <section className="seccion">
          <div className="fz-seccion-cabeza">
            <h2 className="seccion-titulo">Por clasificar · {pendientes.length}</h2>
            {sinPropuesta > 0 && d.bancos.ia && <Boton variante="secundario" pequeno cargando={pensando} icono={<Sparkles size={15} />} onClick={alPedirIa}>Que lo haga la IA</Boton>}
          </div>
          <Tarjeta compacta>
            {pendientes.slice(0, 5).map(m => (
              <button key={m.id} type="button" className="fz-fila" onClick={() => clasificar(m.id)}>
                <span className="fz-fila-texto">
                  <span>{m.contraparte || m.descripcion || 'Sin descripción'}</span>
                  <span className="t-terciario">
                    {m.sugerencia ? <>¿{m.sugerencia.categoria} · {CLASES.find(c => c.valor === m.sugerencia.clase)?.etiqueta}?</> : fechaCorta(m.fecha)}
                  </span>
                </span>
                <span className={`fz-fila-importe ${m.importe > 0 ? 'fz-mas' : ''}`}>{formatear(m.importe, { moneda: m.moneda, decimales: 2, signo: true })}</span>
              </button>
            ))}
            <div className="fz-cola-pie">
              <Boton variante="primario" pequeno onClick={() => clasificar()}>Clasificar {pendientes.length > 1 ? `los ${pendientes.length}` : 'ahora'}</Boton>
              {porIa > 0 && <button type="button" className="fz-enlace" onClick={() => irALibro('ia')}>La IA clasificó {porIa} sola: revisar</button>}
            </div>
          </Tarjeta>
        </section>
      )}
      {pendientes.length === 0 && porIa > 0 && (
        <button type="button" className="fz-enlace fz-enlace--suelto" onClick={() => irALibro('ia')}>Todo clasificado. La IA hizo {porIa} sola: revisar</button>
      )}

      {r.mision && (
        <section className="seccion">
          <h2 className="seccion-titulo">{r.mision.titulo}</h2>
          <Tarjeta>
            <div className="fz-mision-cifras">
              <div>
                <div className="fz-numero-medio">{formatear(r.mision.actual)}</div>
                <div className="t-terciario">de {formatear(r.mision.meta)} · {r.mision.dias} días</div>
              </div>
              <div className="fz-mision-pct">{(r.mision.pct * 100).toLocaleString('es-ES', { maximumFractionDigits: r.mision.pct < 0.01 ? 2 : 1 })} %</div>
            </div>
            <div className="fz-barra"><span style={{ width: `${Math.max(0.6, r.mision.pct * 100)}%` }} /></div>
            <div className="fz-rejilla">
              <div><span className="t-terciario">Pide al día</span><strong>{formatear(r.mision.necesarioDia)}</strong></div>
              <div><span className="t-terciario">Ritmo real{r.mision.fuenteRitmo === 'previstos' ? ' (previstos)' : ''}</span><strong className={r.mision.ritmoReal < r.mision.necesarioDia ? 'fz-menos' : 'fz-mas'}>{formatear(r.mision.ritmoReal, { signo: true })}</strong></div>
              <div><span className="t-terciario">Llegarías con</span><strong>{formatear(r.mision.llegada)}</strong></div>
            </div>
          </Tarjeta>
        </section>
      )}

      <section className="seccion">
        <h2 className="seccion-titulo">Si todo sigue igual</h2>
        <Tarjeta><Proyeccion p={p} hoy={d.hoy} /></Tarjeta>
      </section>

      <section className="seccion">
        <div className="fz-seccion-cabeza">
          <h2 className="seccion-titulo">Caja y bancos</h2>
          <div className="fila">
            <Boton variante="secundario" pequeno icono={<Plus size={16} />} onClick={() => editar('cuenta')}>Cuenta</Boton>
            <Boton variante="secundario" pequeno cargando={sincronizando} icono={<RefreshCw size={15} />} onClick={alSincronizar}>Sincronizar</Boton>
          </div>
        </div>
        <Tarjeta compacta>
          {d.cuentas.length === 0 && <div className="t-terciario fz-vacio-linea">Sin cuentas todavía.</div>}
          {d.cuentas.map(c => (
            <button key={c.id} type="button" className="fz-fila" onClick={() => editar('cuenta', c)}>
              <span className={`fz-banco fz-banco--${c.banco}`}>{c.tipo === 'efectivo' ? '€' : c.banco === 'manual' ? 'M' : c.banco === 'whop' ? 'Wh' : c.banco[0].toUpperCase()}</span>
              <span className="fz-fila-texto">
                <span>{c.nombre}</span>
                <span className="t-terciario">{c.tipo}{c.pct_reparto ? ` · ${c.pct_reparto} %` : ''}</span>
              </span>
              <span className="fz-fila-importe">
                {formatear(c.saldo, { moneda: c.moneda })}
                {c.moneda !== 'EUR' && <span className="t-terciario">{formatear(aBase(c.saldo, c.moneda, tasas))}</span>}
              </span>
            </button>
          ))}
          <div className="fz-sync">
            {!d.bancos.mercury && <span>Mercury sin conectar</span>}
            {!d.bancos.wise && <span>Wise sin conectar</span>}
            {!d.bancos.whop && <span>Whop sin conectar</span>}
            {sync?.en && <span>Última sincronización: {new Date(sync.en).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
            {sync?.resultados?.flatMap(x => [x.error, ...(x.avisos || [])]).filter(Boolean).map(t => <span key={t} className="fz-menos">{t}</span>)}
            {d.ajustes.tasas?.fuente === 'aproximada' && <span>Tipo de cambio aproximado (sin conexión con el BCE)</span>}
          </div>
        </Tarjeta>
      </section>

      <section className="seccion">
        <h2 className="seccion-titulo">Próximos pagos · 30 días</h2>
        <Tarjeta compacta>
          {r.proximos.length === 0 && <div className="t-terciario fz-vacio-linea">Nada previsto en 30 días.</div>}
          {r.proximos.map((x, i) => (
            <button key={`${x.id}-${i}`} type="button" className="fz-fila" onClick={() => editar('previsto', x)}>
              <span className={`fz-icono-tipo ${x.tipo === 'ingreso' ? 'fz-mas' : ''}`}>{x.tipo === 'ingreso' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}</span>
              <span className="fz-fila-texto">
                <span>{x.titulo}</span>
                <span className="t-terciario">{fechaCorta(x.cae)} · en {diasEntre(d.hoy, x.cae)} días{x.suscripcion ? ' · suscripción' : ''}</span>
              </span>
              <span className={`fz-fila-importe ${x.tipo === 'ingreso' ? 'fz-mas' : ''}`}>{formatear(x.tipo === 'ingreso' ? x.base : -x.base)}</span>
            </button>
          ))}
        </Tarjeta>
      </section>

      <section className="seccion">
        <div className="fz-seccion-cabeza">
          <h2 className="seccion-titulo">Suscripciones</h2>
          <Boton variante="secundario" pequeno icono={<Plus size={15} />} onClick={() => editar('previsto', { tipo: 'gasto', clase: 'recortable', suscripcion: true, recurrencia: 'mensual' })}>Añadir</Boton>
        </div>
        <Tarjeta compacta>
          <div className="fz-subs-total">
            <Repeat size={16} strokeWidth={1.6} className="fz-oro" />
            <span>{formatear(subs.mensual)}<span className="t-terciario"> /mes</span></span>
            <span className="t-terciario">{formatear(subs.anual)} al año · {listaSubs.length === 1 ? '1 activa' : `${listaSubs.length} activas`}</span>
          </div>
          {listaSubs.length === 0 && <div className="t-terciario fz-vacio-linea">Cuando un cargo sea una suscripción, márcalo al clasificarlo y aparecerá aquí.</div>}
          {listaSubs.map(x => (
            <button key={x.id} type="button" className="fz-fila" onClick={() => editar('previsto', x)}>
              <span className="fz-fila-texto">
                <span>{x.titulo}</span>
                <span className="t-terciario">
                  {x.proximo ? `Próximo cobro ${fechaCorta(x.proximo)} · en ${diasEntre(d.hoy, x.proximo)} días` : 'Sin fecha'}
                  {x.recurrencia === 'anual' ? ' · anual' : ''}
                  {x.cargos ? ` · ${x.cargos} ${x.cargos === 1 ? 'cargo' : 'cargos'}, el último ${fechaCorta(x.ultimo)}` : ''}
                </span>
              </span>
              <span className="fz-fila-importe">
                {x.importe == null ? <span className="fz-falta">sin importe</span> : formatear(x.importe, { moneda: x.moneda, decimales: x.importe % 1 ? 2 : 0 })}
                {x.importe != null && x.moneda !== 'EUR' && <span className="t-terciario">{formatear(aBase(x.importe, x.moneda, tasas))}</span>}
              </span>
            </button>
          ))}
          {listaSubs.length > 0 && <div className="fz-sync"><span>Toca una para cambiar importe o fecha, o márcala como cancelada cuando la des de baja.</span></div>}
        </Tarjeta>
      </section>
    </div>
  )
}

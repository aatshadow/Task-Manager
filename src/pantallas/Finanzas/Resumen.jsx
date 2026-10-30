import { useState } from 'react'
import { RefreshCw, Plus, AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Boton from '../../componentes/Boton.jsx'
import { aBase, formatear, diasEntre } from '../../datos/finanzasCalculos.js'
import { sincronizar } from '../../datos/finanzas.js'
import Proyeccion from './Proyeccion.jsx'

const SEMAFORO = { verde: 'En verde', ambar: 'Vas por detrás de la Misión', rojo: 'En rojo: hoy no hay margen' }
const fechaCorta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

export default function Resumen({ d, calc, editar, recargar, avisar }) {
  const { r, p } = calc
  const tasas = d.ajustes.tasas?.valores
  const [sincronizando, setSincronizando] = useState(false)

  const alSincronizar = async () => {
    setSincronizando(true)
    try {
      const s = await sincronizar()
      const malos = s.resultados.filter(x => !x.ok)
      const nuevos = s.resultados.reduce((n, x) => n + (x.nuevos || 0), 0)
      if (malos.length === s.resultados.length) avisar(malos.map(m => m.error).join(' · '), 'error')
      else avisar(`${nuevos} movimientos nuevos${s.internos ? ` · ${s.internos} transferencias internas` : ''}`)
      await recargar()
    } catch (e) { avisar(e.message, 'error') } finally { setSincronizando(false) }
  }

  const cascada = [
    { etiqueta: 'Liquidez (todas las cuentas)', valor: r.liquidez },
    { etiqueta: `Impuestos (${d.ajustes.impuestos_pct} % de lo cobrado)`, valor: -r.impuestos },
    { etiqueta: `Colchón (${d.ajustes.colchon_meses} meses de fijos)`, valor: -r.colchon },
    { etiqueta: 'Comprometido próximos 30 días', valor: -r.comprometido },
    { etiqueta: 'Apartar para lo previsto lejano', valor: -r.reservaFutura },
  ]
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
          <h2 className="seccion-titulo">Cuentas y pockets</h2>
          <div className="fila">
            <Boton variante="secundario" pequeno icono={<Plus size={16} />} onClick={() => editar('cuenta')}>Cuenta</Boton>
            <Boton variante="secundario" pequeno cargando={sincronizando} icono={<RefreshCw size={15} />} onClick={alSincronizar}>Sincronizar</Boton>
          </div>
        </div>
        <Tarjeta compacta>
          {d.cuentas.length === 0 && <div className="t-terciario fz-vacio-linea">Sin cuentas todavía.</div>}
          {d.cuentas.map(c => (
            <button key={c.id} type="button" className="fz-fila" onClick={() => editar('cuenta', c)}>
              <span className={`fz-banco fz-banco--${c.banco}`}>{c.banco === 'manual' ? 'M' : c.banco[0].toUpperCase()}</span>
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
            {sync?.en && <span>Última sincronización: {new Date(sync.en).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
            {sync?.resultados?.flatMap(x => [x.error, ...(x.avisos || [])]).filter(Boolean).map(t => <span key={t} className="fz-menos">{t}</span>)}
            {d.ajustes.tasas?.fuente === 'aproximada' && <span>Tipo de cambio aproximado (sin conexión con el BCE)</span>}
          </div>
        </Tarjeta>
      </section>

      <section className="seccion">
        <h2 className="seccion-titulo">Próximos 30 días</h2>
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
    </div>
  )
}

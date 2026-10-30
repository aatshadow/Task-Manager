import { useCallback, useEffect, useMemo, useState } from 'react'
import { Scale, Plus, CheckCircle2, AlertTriangle } from 'lucide-react'
import Segmentos from '../../componentes/Segmentos.jsx'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Boton from '../../componentes/Boton.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import Hoja from '../../componentes/Hoja.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as fin from '../../datos/finanzas.js'
import { formatear, opcionesDe } from '../../datos/finanzasCalculos.js'
import { libroDiario, balance, resultados, mayor } from '../../datos/contabilidad.js'
import HojaEditar from './HojaEditar.jsx'
import './finanzas.css'

/**
 * Contabilidad (LOGICA §17.7): el balance de situación, la cuenta de resultados y el libro
 * diario, todo por partida doble a partir de los mismos datos de Finanzas. Cada movimiento es
 * un asiento; tocar una cuenta abre su mayor. Lo único que se edita aquí son las partidas que no
 * salen de un banco: el inmovilizado (a valor de mercado) y las deudas.
 */
const VISTAS = [
  { valor: 'balance', etiqueta: 'Balance' },
  { valor: 'resultados', etiqueta: 'Resultados' },
  { valor: 'diario', etiqueta: 'Libro diario' },
]
const fechaLarga = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
const fechaCorta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const eur = (n) => formatear(n, { decimales: 2 })

function Bloque({ titulo, total, lineas, alCuenta, alPartida, partidas }) {
  return (
    <div className="ct-bloque">
      <div className="ct-bloque-cabeza"><span>{titulo}</span><strong>{eur(total)}</strong></div>
      {lineas.length === 0 && <div className="t-terciario ct-vacio">—</div>}
      {lineas.map(l => {
        // las cuentas de inmovilizado y deudas se desglosan en sus partidas, que son editables
        const suyas = partidas?.filter(p => p.cuenta === l.cuenta.split('.')[0]) || []
        return (
          <div key={l.cuenta}>
            <button type="button" className="ct-linea" onClick={() => alCuenta(l.cuenta)}>
              <span className="ct-codigo">{l.cuenta.split('.')[0]}</span>
              <span className="ct-nombre">{l.nombre}</span>
              <span className={`ct-importe${l.importe < 0 ? ' fz-menos' : ''}`}>{eur(l.importe)}</span>
            </button>
            {suyas.map(p => (
              <button key={p.id} type="button" className="ct-linea ct-linea--partida" onClick={() => alPartida(p)}>
                <span className="ct-codigo" />
                <span className="ct-nombre">{p.nombre}{p.vencimiento ? ` · vence ${fechaCorta(p.vencimiento)}` : ''}</span>
                <span className="ct-importe">{formatear(p.valor, { moneda: p.moneda, decimales: 0 })}</span>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function Asiento({ a, abierto }) {
  const debe = a.lineas.reduce((s, l) => s + l.debe, 0)
  const haber = a.lineas.reduce((s, l) => s + l.haber, 0)
  return (
    <div className={`ct-asiento${a.pendiente ? ' ct-asiento--pendiente' : ''}`}>
      <div className="ct-asiento-cabeza">
        <span className="ct-asiento-n">{a.n}</span>
        <span className="ct-asiento-concepto">{a.concepto}</span>
        <span className="t-terciario">{fechaCorta(a.fecha)}</span>
      </div>
      {abierto !== false && (
        <div className="ct-tabla">
          {a.lineas.map((l, i) => (
            <div key={i} className="ct-tabla-fila">
              <span className="ct-codigo">{l.cuenta.split('.')[0]}</span>
              <span className={`ct-nombre${l.haber ? ' ct-nombre--haber' : ''}`}>{l.concepto && a.tipo === 'apertura' ? `${l.nombre} · ${l.concepto}` : l.nombre}</span>
              <span className="ct-debe">{l.debe ? eur(l.debe) : ''}</span>
              <span className="ct-haber">{l.haber ? eur(l.haber) : ''}</span>
            </div>
          ))}
          {a.lineas.length > 2 && (
            <div className="ct-tabla-fila ct-tabla-suma">
              <span className="ct-codigo" /><span className="ct-nombre">Sumas</span>
              <span className="ct-debe">{eur(debe)}</span><span className="ct-haber">{eur(haber)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Contabilidad() {
  const { avisar } = useDatos()
  const [vista, setVista] = useState(() => { try { return localStorage.getItem('ct-vista') || 'balance' } catch { return 'balance' } })
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)
  const [cuentaAbierta, setCuentaAbierta] = useState(null)
  const [editando, setEditando] = useState(null)
  const [busca, setBusca] = useState('')

  const recargar = useCallback(async () => {
    try { const nuevo = await fin.cargar(); setD(nuevo); setError(null); return nuevo } catch (e) { setError(e.message); return null }
  }, [])
  useEffect(() => { recargar() }, [recargar])
  useEffect(() => { try { localStorage.setItem('ct-vista', vista) } catch { /* sin almacenamiento */ } }, [vista])

  const c = useMemo(() => {
    if (!d) return null
    const { asientos } = libroDiario(d)
    const anio = d.hoy.slice(0, 4)
    return { asientos, b: balance(asientos, d.hoy), pyg: resultados(asientos, `${anio}-01-01`, d.hoy), m: mayor(asientos), anio }
  }, [d])
  const op = useMemo(() => (d ? opcionesDe(d) : null), [d])

  const guardar = useCallback(async (tabla, fila, texto = 'Guardado') => {
    try { await fin.guardar(tabla, fila); if (texto) avisar(texto); await recargar(); return true } catch (e) { avisar(e.message, 'error'); return false }
  }, [avisar, recargar])
  const borrar = useCallback(async (tabla, id) => {
    try { await fin.borrar(tabla, id); avisar('Borrado'); await recargar(); return true } catch (e) { avisar(e.message, 'error'); return false }
  }, [avisar, recargar])

  if (error && !d) {
    return <div className="pantalla"><Vacio icono={Scale} titulo="La contabilidad no responde" texto={error} accion={<Boton variante="secundario" onClick={recargar}>Reintentar</Boton>} /></div>
  }
  if (!d || !c) return <div className="pantalla"><div className="fz-cargando">Cuadrando el balance…</div></div>

  const { b, pyg, asientos, m } = c
  const pendientes = asientos.filter(a => a.pendiente).length
  const partidas = d.partidas.filter(p => p.activa !== false)
  const abrirPartida = (p) => setEditando({ tipo: 'partida', fila: p })
  const cuenta = cuentaAbierta ? m[cuentaAbierta] : null
  const diario = [...asientos].reverse().filter(a => !busca || `${a.concepto} ${a.lineas.map(l => `${l.cuenta} ${l.nombre}`).join(' ')}`.toLowerCase().includes(busca.toLowerCase()))

  return (
    <div className="pantalla fz">
      <Segmentos opciones={VISTAS} valor={vista} alCambiar={setVista} className="fz-vistas" />

      {vista === 'balance' && (
        <div className="fz-vista">
          <Tarjeta variante="calida" className="ct-cabeza">
            <div className="fz-micro">Balance de situación a {fechaLarga(d.hoy)}</div>
            <div className="ct-ecuacion">
              <div><span className="t-terciario">Activo</span><strong>{formatear(b.activo.total)}</strong></div>
              <span>=</span>
              <div><span className="t-terciario">Pasivo</span><strong>{formatear(b.pasivo.total)}</strong></div>
              <span>+</span>
              <div><span className="t-terciario">Patrim. neto</span><strong className={b.patrimonio.total < 0 ? 'fz-menos' : ''}>{formatear(b.patrimonio.total)}</strong></div>
            </div>
            <div className={`ct-cuadre${b.cuadra ? '' : ' ct-cuadre--mal'}`}>
              {b.cuadra ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              {b.cuadra ? `Cuadra · ${asientos.length} asientos` : 'No cuadra: revisa el libro diario'}
            </div>
            <div className="fz-rejilla ct-ratios">
              <div><span className="t-terciario">Caja y bancos</span><strong>{eur(b.tesoreria)}</strong></div>
              <div><span className="t-terciario">Fondo de maniobra</span><strong className={b.fondoManiobra < 0 ? 'fz-menos' : ''}>{eur(b.fondoManiobra)}</strong></div>
              <div><span className="t-terciario">Endeudamiento</span><strong>{b.endeudamiento == null ? '—' : `${Math.round(b.endeudamiento * 100)} %`}</strong></div>
            </div>
          </Tarjeta>

          {pendientes > 0 && (
            <Tarjeta className="fz-aviso">
              <AlertTriangle size={18} strokeWidth={1.7} />
              <div><strong>{pendientes === 1 ? '1 asiento' : `${pendientes} asientos`} en la 555 (pendientes de aplicación):</strong> {pendientes === 1 ? 'es un movimiento' : 'son movimientos'} sin clasificar. Clasifícalos en Finanzas y pasarán a su cuenta.</div>
            </Tarjeta>
          )}

          <section className="seccion">
            <div className="fz-seccion-cabeza">
              <h2 className="seccion-titulo">Activo</h2>
              <Boton variante="secundario" pequeno icono={<Plus size={15} />} onClick={() => setEditando({ tipo: 'partida', fila: { lado: 'activo', plazo: 'no_corriente', cuenta: '217', fecha: d.hoy } })}>Activo</Boton>
            </div>
            <Tarjeta compacta>
              <Bloque titulo="Activo no corriente" total={b.activo.totalNoCorriente} lineas={b.activo.noCorriente} alCuenta={setCuentaAbierta} alPartida={abrirPartida} partidas={partidas.filter(p => p.lado === 'activo')} />
              <Bloque titulo="Activo corriente · caja y bancos" total={b.activo.totalCorriente} lineas={[...b.activo.tesoreria, ...b.activo.otrosCorriente]} alCuenta={setCuentaAbierta} />
              <div className="ct-total"><span>Total activo</span><strong>{eur(b.activo.total)}</strong></div>
            </Tarjeta>
          </section>

          <section className="seccion">
            <div className="fz-seccion-cabeza">
              <h2 className="seccion-titulo">Pasivo y patrimonio neto</h2>
              <Boton variante="secundario" pequeno icono={<Plus size={15} />} onClick={() => setEditando({ tipo: 'partida', fila: { lado: 'pasivo', plazo: 'corriente', cuenta: '520', fecha: d.hoy } })}>Deuda</Boton>
            </div>
            <Tarjeta compacta>
              <Bloque titulo="Patrimonio neto" total={b.patrimonio.total} lineas={b.patrimonio.lineas} alCuenta={(k) => (k === '129' ? setVista('resultados') : setCuentaAbierta(k))} />
              <Bloque titulo="Pasivo no corriente" total={b.pasivo.totalNoCorriente} lineas={b.pasivo.noCorriente} alCuenta={setCuentaAbierta} alPartida={abrirPartida} partidas={partidas.filter(p => p.lado === 'pasivo')} />
              <Bloque titulo="Pasivo corriente" total={b.pasivo.totalCorriente} lineas={b.pasivo.corriente} alCuenta={setCuentaAbierta} alPartida={abrirPartida} partidas={partidas.filter(p => p.lado === 'pasivo')} />
              <div className="ct-total"><span>Total pasivo y patrimonio neto</span><strong>{eur(b.pasivo.total + b.patrimonio.total)}</strong></div>
            </Tarjeta>
          </section>

          <div className="t-terciario ct-pie">
            Partida doble con el cuadro del PGC adaptado a una LLC de un solo socio: lo personal pagado por la empresa va a la 551 (retiradas del socio) y resta en el patrimonio, no es gasto. Whop y el efectivo cuentan como caja y bancos. Importes en EUR al cambio del BCE de hoy. El inmovilizado, a valor de mercado: si lo bajas, la diferencia se amortiza (681 contra 2817).
          </div>
        </div>
      )}

      {vista === 'resultados' && (
        <div className="fz-vista">
          <Tarjeta variante="calida" className="ct-cabeza">
            <div className="fz-micro">Cuenta de resultados · 1 ene – {fechaLarga(d.hoy)}</div>
            <div className={`fz-hero-numero ct-resultado${pyg.resultado < 0 ? ' fz-hero-numero--rojo' : ''}`}>{formatear(pyg.resultado, { signo: true })}</div>
            <div className="t-secundario">{pyg.resultado >= 0 ? 'Beneficio' : 'Pérdida'} del ejercicio {c.anio}</div>
          </Tarjeta>
          <Tarjeta compacta>
            <Bloque titulo="Ingresos" total={pyg.totalIngresos} lineas={pyg.ingresos} alCuenta={setCuentaAbierta} />
            <Bloque titulo="Gastos" total={-pyg.totalGastos} lineas={pyg.gastos.map(g => ({ ...g, importe: -g.importe }))} alCuenta={setCuentaAbierta} />
            <div className="ct-total"><span>Resultado de explotación</span><strong>{eur(pyg.explotacion)}</strong></div>
            {pyg.financieros !== 0 && <div className="ct-total"><span>Resultado financiero</span><strong>{eur(pyg.financieros)}</strong></div>}
            <div className="ct-total ct-total--fuerte"><span>Resultado del ejercicio</span><strong className={pyg.resultado < 0 ? 'fz-menos' : ''}>{eur(pyg.resultado)}</strong></div>
          </Tarjeta>
          {m['551'] && (
            <div className="t-terciario ct-pie">Aparte, el socio ha retirado {eur(m['551'].saldo)} para gastos personales (cuenta 551): no son gasto de la empresa, restan en el patrimonio neto.</div>
          )}
        </div>
      )}

      {vista === 'diario' && (
        <div className="fz-vista">
          <div className="fz-chat-caja ct-busca">
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar concepto o cuenta…" />
          </div>
          <div className="t-terciario ct-pie">{asientos.length} asientos · sumas del debe {eur(asientos.reduce((s, a) => s + a.lineas.reduce((t, l) => t + l.debe, 0), 0))} = sumas del haber {eur(asientos.reduce((s, a) => s + a.lineas.reduce((t, l) => t + l.haber, 0), 0))}</div>
          <Tarjeta compacta>
            <div className="ct-tabla-fila ct-tabla-titulos"><span>Cta.</span><span>Asiento</span><span className="ct-debe">Debe</span><span className="ct-haber">Haber</span></div>
            {diario.map(a => <Asiento key={a.n} a={a} />)}
          </Tarjeta>
        </div>
      )}

      <Hoja abierta={!!cuenta} alCerrar={() => setCuentaAbierta(null)} titulo={cuenta ? `${cuentaAbierta.split('.')[0]} · ${cuenta.nombre}` : ''}>
        {cuenta && (
          <div className="columna">
            <div className="fz-rejilla">
              <div><span className="t-terciario">Debe</span><strong>{eur(cuenta.debe)}</strong></div>
              <div><span className="t-terciario">Haber</span><strong>{eur(cuenta.haber)}</strong></div>
              <div><span className="t-terciario">Saldo</span><strong>{eur(cuenta.saldo)}</strong></div>
            </div>
            <div className="ct-tabla ct-mayor">
              {(() => {
                let saldo = 0
                return cuenta.apuntes.map((x, i) => {
                  saldo += x.debe - x.haber
                  return (
                    <div key={i} className="ct-tabla-fila ct-tabla-fila--mayor">
                      <span className="t-terciario">{fechaCorta(x.fecha)}</span>
                      <span className="ct-nombre">{x.concepto}<span className="t-terciario"> · as. {x.n}</span></span>
                      <span className="ct-debe">{x.debe ? eur(x.debe) : ''}</span>
                      <span className="ct-haber">{x.haber ? eur(x.haber) : ''}</span>
                      <span className="ct-saldo">{eur(saldo)}</span>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}
      </Hoja>
      <HojaEditar editando={editando} d={d} op={op} crearOpcion={() => {}} alCerrar={() => setEditando(null)} guardar={guardar} borrar={borrar} avisar={avisar} recargar={recargar} />
    </div>
  )
}

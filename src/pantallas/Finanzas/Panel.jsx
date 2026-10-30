import { useMemo, useState } from 'react'
import { Tags } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Segmentos from '../../componentes/Segmentos.jsx'
import Boton from '../../componentes/Boton.jsx'
import { panel, formatear, sumarDias, porClasificar } from '../../datos/finanzasCalculos.js'
import { BarrasFlujo, LineaSaldo, Ranking, Leyenda } from './Graficos.jsx'

/**
 * El panel del dinero (LOGICA §17.5): a dónde ha ido cada euro y de dónde vino. Todo sale de
 * `panel()` en finanzasCalculos.js; esta pantalla sólo elige el periodo y dibuja.
 */
const PERIODOS = [
  { valor: '30', etiqueta: '30 días' },
  { valor: 'mes', etiqueta: 'Este mes' },
  { valor: '90', etiqueta: '3 meses' },
  { valor: 'anio', etiqueta: 'Año' },
  { valor: 'todo', etiqueta: 'Todo' },
]
function desdeDe(periodo, hoy) {
  if (periodo === '30') return sumarDias(hoy, -29)
  if (periodo === '90') return sumarDias(hoy, -89)
  if (periodo === 'mes') return `${hoy.slice(0, 7)}-01`
  if (periodo === 'anio') return `${hoy.slice(0, 4)}-01-01`
  return null
}

export default function Panel({ d, clasificar, editar }) {
  const [periodo, setPeriodo] = useState(() => { try { return localStorage.getItem('fin-periodo') || '30' } catch { return '30' } })
  const elegir = (p) => { setPeriodo(p); try { localStorage.setItem('fin-periodo', p) } catch { /* sin almacenamiento */ } }
  const [agrupar, setAgrupar] = useState('auto')
  const x = useMemo(() => panel(d, desdeDe(periodo, d.hoy), agrupar), [d, periodo, agrupar])
  const filaRitmo = (etiqueta, k, clase) => (
    <>
      <span>{etiqueta}</span>
      {['dia', 'semana', 'mes'].map(p => {
        const v = k === 'neto' ? x.ritmo[p].entra - x.ritmo[p].sale : x.ritmo[p][k]
        return <span key={p}><strong className={clase && clase(v)}>{formatear(v, { signo: k === 'neto', decimales: p === 'dia' && Math.abs(v) < 100 ? 2 : 0 })}</strong></span>
      })}
    </>
  )
  // tocar un movimiento: si le falta clase, a clasificarlo; si no, a su ficha
  const abrir = (m) => {
    const fila = d.movimientos.find(y => y.id === m.id) || m
    if (porClasificar(fila)) clasificar(fila.id)
    else editar('movimiento', fila)
  }

  if (!d.movimientos.length) {
    return <Tarjeta className="fz-aviso"><div>Aún no hay movimientos. Sincroniza los bancos o apunta a mano y aquí verás a dónde va cada euro.</div></Tarjeta>
  }

  return (
    <div className="fz-vista">
      <Segmentos opciones={PERIODOS} valor={periodo} alCambiar={elegir} className="fz-periodos" />

      <div className="fz-tiles">
        <Tarjeta compacta className="fz-tile"><span className="t-terciario">Entró</span><strong className="fz-mas">{formatear(x.entra)}</strong></Tarjeta>
        <Tarjeta compacta className="fz-tile"><span className="t-terciario">Salió</span><strong>{formatear(x.sale)}</strong></Tarjeta>
        <Tarjeta compacta className="fz-tile"><span className="t-terciario">Neto</span><strong className={x.neto < 0 ? 'fz-menos' : 'fz-mas'}>{formatear(x.neto, { signo: true })}</strong></Tarjeta>
        <Tarjeta compacta className="fz-tile">
          <span className="t-terciario">{x.ahorro == null ? 'Gasto al día' : 'Ahorras'}</span>
          <strong>{x.ahorro == null ? formatear(x.gastoDia) : `${Math.round(x.ahorro * 100)} %`}</strong>
          {x.ahorro != null && <span className="t-terciario">{formatear(x.gastoDia)}/día de gasto</span>}
        </Tarjeta>
      </div>

      {x.sinClasificar > 0 && (
        <Tarjeta className="fz-aviso fz-aviso--accion" onClick={() => clasificar()}>
          <Tags size={18} strokeWidth={1.7} />
          <div><strong>{x.sinClasificar} sin clasificar</strong> en este periodo: salen como «Sin clasificar» en los gráficos. Tócalo para ordenarlos.</div>
        </Tarjeta>
      )}

      <section className="seccion">
        <h2 className="seccion-titulo">Cuánto ganas y gastas</h2>
        <Tarjeta compacta>
          <div className="fz-ritmo">
            <span className="fz-ritmo-cab">De media</span><span className="fz-ritmo-cab">al día</span><span className="fz-ritmo-cab">a la semana</span><span className="fz-ritmo-cab">al mes</span>
            {filaRitmo('Entra', 'entra', () => 'fz-mas')}
            {filaRitmo('Sale', 'sale')}
            {filaRitmo('Queda', 'neto', v => (v < 0 ? 'fz-menos' : 'fz-mas'))}
          </div>
          <div className="t-terciario fz-nota">Medias sobre los {x.ritmo.dias} días del periodo, sin traspasos internos.</div>
        </Tarjeta>
      </section>

      <section className="seccion">
        <div className="fz-seccion-cabeza">
          <h2 className="seccion-titulo">Entra y sale por {x.modo === 'dia' ? 'día' : x.modo}</h2>
          <Segmentos opciones={[{ valor: 'dia', etiqueta: 'Día' }, { valor: 'semana', etiqueta: 'Semana' }, { valor: 'mes', etiqueta: 'Mes' }]} valor={x.modo} alCambiar={setAgrupar} className="fz-agrupar" />
        </div>
        <Tarjeta>
          <BarrasFlujo tramos={x.flujo} />
          <Leyenda items={[{ etiqueta: 'Entró', clase: 'fz-g-entra' }, { etiqueta: 'Salió', clase: 'fz-g-sale' }]} />
        </Tarjeta>
      </section>

      <section className="seccion">
        <h2 className="seccion-titulo">A dónde ha ido</h2>
        <Tarjeta><Ranking grupos={x.categorias} total={x.sale} alMovimiento={abrir} vacio="No ha salido nada en este periodo." /></Tarjeta>
      </section>

      <section className="seccion">
        <h2 className="seccion-titulo">Obligatorio, recortable o libre</h2>
        <Tarjeta><Ranking grupos={x.clases} total={x.sale} alMovimiento={abrir} vacio="No ha salido nada en este periodo." /></Tarjeta>
      </section>

      <section className="seccion">
        <h2 className="seccion-titulo">Saldo de todas las cuentas</h2>
        <Tarjeta><LineaSaldo serie={x.serie} /></Tarjeta>
      </section>

      <section className="seccion">
        <h2 className="seccion-titulo">De dónde entra</h2>
        <Tarjeta><Ranking grupos={x.clientes} total={x.entra} alMovimiento={abrir} vacio="No ha entrado nada en este periodo." /></Tarjeta>
      </section>

      <section className="seccion">
        <h2 className="seccion-titulo">Dónde más gastas</h2>
        <Tarjeta><Ranking grupos={x.comercios} total={x.sale} alMovimiento={abrir} vacio="No ha salido nada en este periodo." /></Tarjeta>
      </section>

      {x.negocios.some(g => g.clave !== 'Sin clasificar') && (
        <section className="seccion">
          <h2 className="seccion-titulo">Gasto por negocio</h2>
          <Tarjeta><Ranking grupos={x.negocios} total={x.sale} alMovimiento={abrir} /></Tarjeta>
        </section>
      )}

      <Boton variante="fantasma" completo onClick={() => clasificar()} disabled={!d.movimientos.some(porClasificar)}>
        {d.movimientos.some(porClasificar) ? 'Clasificar lo pendiente' : 'Todo clasificado'}
      </Boton>
    </div>
  )
}

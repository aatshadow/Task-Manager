import { useState } from 'react'
import { Plus, Calculator } from 'lucide-react'
import Hoja from '../../componentes/Hoja.jsx'
import Boton from '../../componentes/Boton.jsx'
import { formatear } from '../../datos/finanzasCalculos.js'
import { arqueo } from '../../datos/finanzas.js'

/**
 * La caja física (LOGICA §17.9). Lo que hay es lo retirado en cajeros desde que existe la caja,
 * menos lo que Alex ha apuntado que gastó en efectivo. «Contar la caja» (arqueo) ajusta lo
 * apuntado a lo que lleva encima: la diferencia es suya (551), no un gasto de la empresa.
 */
export default function HojaEfectivo({ caja, d, alCerrar, editar, recargar, avisar }) {
  const [contado, setContado] = useState('')
  const [contando, setContando] = useState(false)
  if (!caja) return <Hoja abierta={false} alCerrar={alCerrar} />
  const movs = d.movimientos.filter(m => m.cuenta_id === caja.id && m.estado !== 'cancelado')
  const entrado = movs.filter(m => m.importe > 0).reduce((s, m) => s + Number(m.importe), 0)
  const gastado = movs.filter(m => m.importe < 0).reduce((s, m) => s - Number(m.importe), 0)
  const desde = new Date(caja.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })

  const alContar = async () => {
    setContando(true)
    try {
      const r = await arqueo(String(contado).replace(',', '.'))
      avisar(r.diferencia === 0 ? 'La caja cuadra' : r.diferencia < 0 ? `Faltaban ${formatear(-r.diferencia, { decimales: 2 })}: apuntados como gasto sin justificar` : `Sobraban ${formatear(r.diferencia, { decimales: 2 })}: ya están en la caja`)
      setContado('')
      await recargar()
    } catch (e) { avisar(e.message, 'error') } finally { setContando(false) }
  }

  return (
    <Hoja abierta alCerrar={alCerrar} titulo="Efectivo">
      <div className="columna fz-formulario">
        <div className="fz-clas-mov">
          <div className="t-terciario">En caja ahora, según lo apuntado</div>
          <div className="fz-clas-importe">{formatear(caja.saldo, { decimales: 2 })}</div>
          <div className="t-terciario">Desde el {desde}: retirado {formatear(entrado, { decimales: 2 })} · gastado y apuntado {formatear(gastado, { decimales: 2 })}</div>
        </div>
        {Number(caja.saldo) > 0 && (
          <div className="fz-propuesta">
            <span>Lo que hay en caja aún no tiene destino. Cuando lo gastes, apúntalo y saldrá en el Panel con su categoría.</span>
          </div>
        )}
        <Boton variante="primario" completo icono={<Plus size={18} />} onClick={() => editar('movimiento', { cuenta_id: caja.id, fecha: d.hoy, moneda: 'EUR', _sentido: 'gasto', clase: 'libre' })}>Apuntar un gasto en efectivo</Boton>

        <div className="campo">
          <div className="campo-etiqueta">Contar la caja (arqueo)</div>
          <div className="fz-chat-caja">
            <input inputMode="decimal" value={contado} onChange={e => setContado(e.target.value)} placeholder="¿Cuánto llevas encima? €" />
            <Boton variante="secundario" pequeno cargando={contando} icono={<Calculator size={15} />} onClick={alContar} disabled={contado === ''}>Cuadrar</Boton>
          </div>
          <div className="t-terciario fz-nota">Si falta dinero, lo que no apuntaste queda como gasto sin justificar (personal). Si sobra, entra en la caja.</div>
        </div>

        {movs.length > 0 && (
          <div>
            <div className="campo-etiqueta">Movimientos de la caja</div>
            {movs.slice(0, 30).map(m => (
              <button key={m.id} type="button" className="fz-fila" onClick={() => editar('movimiento', m)}>
                <span className="fz-fila-texto">
                  <span>{m.descripcion || m.contraparte || 'Efectivo'}</span>
                  <span className="t-terciario">{new Date(`${m.fecha}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}{m.categoria ? ` · ${m.categoria}` : ''}</span>
                </span>
                <span className={`fz-fila-importe ${m.importe > 0 ? 'fz-mas' : ''}`}>{formatear(m.importe, { decimales: 2, signo: true })}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Hoja>
  )
}

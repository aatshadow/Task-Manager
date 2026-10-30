import { useMemo, useState } from 'react'
import { Plus, Paperclip, Link2 } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Boton from '../../componentes/Boton.jsx'
import Chip from '../../componentes/Chip.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import { aBase, formatear, CLASES } from '../../datos/finanzasCalculos.js'
import { BookOpen } from 'lucide-react'

const FILTROS = [
  { valor: 'todo', etiqueta: 'Todo', vale: () => true },
  { valor: 'ingresos', etiqueta: 'Ingresos', vale: m => m.importe > 0 && m.clase !== 'interno' },
  { valor: 'gastos', etiqueta: 'Gastos', vale: m => m.importe < 0 && m.clase !== 'interno' },
  { valor: 'sin', etiqueta: 'Sin clasificar', vale: m => !m.clase },
  { valor: 'internos', etiqueta: 'Internos', vale: m => m.clase === 'interno' },
]
const dia = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
const etiquetaClase = (c) => CLASES.find(x => x.valor === c)?.etiqueta

export default function Libro({ d, editar }) {
  const [filtro, setFiltro] = useState('todo')
  const tasas = d.ajustes.tasas?.valores
  const cuentas = useMemo(() => Object.fromEntries(d.cuentas.map(c => [c.id, c])), [d.cuentas])
  const conDocs = useMemo(() => new Set(d.documentos.map(x => x.movimiento_id).filter(Boolean)), [d.documentos])
  const vale = FILTROS.find(f => f.valor === filtro).vale
  const lista = d.movimientos.filter(vale)
  const sinClase = d.movimientos.filter(m => !m.clase).length

  const mes = d.hoy.slice(0, 7)
  const delMes = d.movimientos.filter(m => m.fecha.startsWith(mes) && m.clase !== 'interno' && m.estado !== 'cancelado')
  const entra = delMes.filter(m => m.importe > 0).reduce((s, m) => s + aBase(m.importe, m.moneda, tasas), 0)
  const sale = delMes.filter(m => m.importe < 0).reduce((s, m) => s - aBase(m.importe, m.moneda, tasas), 0)

  const grupos = []
  for (const m of lista) {
    const g = grupos[grupos.length - 1]
    if (g?.fecha === m.fecha) g.items.push(m)
    else grupos.push({ fecha: m.fecha, items: [m] })
  }

  return (
    <div className="fz-vista">
      <Tarjeta compacta>
        <div className="fz-rejilla">
          <div><span className="t-terciario">Entra este mes</span><strong className="fz-mas">{formatear(entra)}</strong></div>
          <div><span className="t-terciario">Sale este mes</span><strong>{formatear(-sale)}</strong></div>
          <div><span className="t-terciario">Neto</span><strong className={entra - sale < 0 ? 'fz-menos' : 'fz-mas'}>{formatear(entra - sale, { signo: true })}</strong></div>
        </div>
      </Tarjeta>

      <div className="fz-filtros">
        {FILTROS.map(f => (
          <Chip key={f.valor} onClick={() => setFiltro(f.valor)} activo={filtro === f.valor} punto={false} color="var(--acento)">
            {f.etiqueta}{f.valor === 'sin' && sinClase ? ` · ${sinClase}` : ''}
          </Chip>
        ))}
      </div>

      <Boton variante="secundario" completo icono={<Plus size={18} />} onClick={() => editar('movimiento', { fecha: d.hoy, moneda: 'EUR', clase: 'libre' })}>Apuntar a mano</Boton>

      {lista.length === 0 && (
        <Vacio icono={BookOpen} titulo="El libro está vacío" texto={d.movimientos.length ? 'Nada con este filtro.' : 'Cuando conectes Mercury y Wise, cada movimiento entra solo. Mientras, apunta a mano.'} />
      )}

      {grupos.map(g => (
        <section key={g.fecha} className="fz-dia">
          <h3 className="fz-dia-titulo">{dia(g.fecha)}</h3>
          <Tarjeta compacta>
            {g.items.map(m => (
              <button key={m.id} type="button" className="fz-fila" onClick={() => editar('movimiento', m)}>
                <span className={`fz-banco fz-banco--${cuentas[m.cuenta_id]?.banco || 'manual'}`}>{(cuentas[m.cuenta_id]?.banco || 'manual')[0].toUpperCase()}</span>
                <span className="fz-fila-texto">
                  <span>{m.contraparte || m.descripcion || 'Sin descripción'}</span>
                  <span className="t-terciario">
                    {m.clase ? etiquetaClase(m.clase) : <span className="fz-falta">sin clasificar</span>}
                    {m.categoria ? ` · ${m.categoria}` : ''}{m.negocio ? ` · ${m.negocio}` : ''}{m.estado === 'pendiente' ? ' · pendiente' : ''}
                  </span>
                </span>
                <span className={`fz-fila-importe ${m.importe > 0 ? 'fz-mas' : ''} ${m.clase === 'interno' ? 'fz-interno' : ''}`}>
                  <span className="fila" style={{ gap: 6 }}>
                    {conDocs.has(m.id) && <Paperclip size={12} className="t-terciario" />}
                    {m.previsto_id && <Link2 size={12} className="t-terciario" />}
                    {formatear(m.importe, { moneda: m.moneda, decimales: 2, signo: true })}
                  </span>
                  {m.moneda !== 'EUR' && <span className="t-terciario">{formatear(aBase(m.importe, m.moneda, tasas), { decimales: 2 })}</span>}
                </span>
              </button>
            ))}
          </Tarjeta>
        </section>
      ))}
    </div>
  )
}

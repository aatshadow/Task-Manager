import { useEffect, useMemo, useState } from 'react'
import { Check, Mic, Terminal, Sparkles, RefreshCw, TriangleAlert, Loader2 } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Boton from '../../componentes/Boton.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { adherencia, estaHecho, tocaHoy } from '../../datos/habitos.js'
import { cargarDia, cargarReuniones, resumenDia } from '../../datos/bitacora.js'
import { diaDe } from '../../datos/fechas.js'

const hora = (ts) => new Date(ts).toTimeString().slice(0, 5)
const coma = (n) => String(n).replace('.', ',')

/**
 * La lectura IA del día (§16.3): qué ha pasado, de dónde venimos y a dónde vamos. La app sólo la
 * pide; el Mac la escribe en unos minutos (`bitacora/eod_lectura.py`) y aquí se relee sola.
 */
export function Lectura({ eod, alPedir }) {
  const l = eod?.lectura
  const pedida = eod?.lecturaEstado === 'pedido'
  const fallo = eod?.lecturaEstado === 'error'
  return (
    <section className="seccion">
      <div className="seccion-titulo eod-preguntas-titulo">
        <span className="eod-con-icono"><Sparkles size={14} /> Lectura del día</span>
        {eod && !pedida && (
          <button type="button" className="eod-editar" onClick={alPedir}>
            <RefreshCw size={14} /> {l ? 'Regenerar' : 'Generar'}
          </button>
        )}
      </div>
      {pedida && (
        <Tarjeta compacta className="eod-lectura-espera">
          <Loader2 size={16} className="boton-girando" /> Claude la está escribiendo en el Mac; tarda unos minutos y aparece aquí sola.
        </Tarjeta>
      )}
      {fallo && !pedida && (
        <Tarjeta compacta className="eod-lectura-espera eod-lectura-error">
          <TriangleAlert size={16} /> No se pudo escribir: {eod.lecturaError || 'error desconocido'}
        </Tarjeta>
      )}
      {!l && !pedida && !fallo && (
        <div className="eod-nada">Pídela cuando quieras (se pide sola al cerrar el día). Cuanto más hayas rellenado, mejor lee.</div>
      )}
      {l && (
        <Tarjeta variante="calida" className={`eod-lectura${pedida ? ' eod-lectura--vieja' : ''}`}>
          <div className="eod-lectura-cabeza">
            <div className="eod-lectura-titular">{l.titular}</div>
            {l.nota != null && <div className="eod-lectura-nota"><b>{coma(l.nota)}</b>/10</div>}
          </div>
          <Parte titulo="Hoy" texto={l.hoy} />
          <Parte titulo="De dónde venimos" texto={l.de_donde_venimos} />
          <Parte titulo="A dónde vamos" texto={l.a_donde_vamos} />
          {!!l.senales?.length && (
            <ul className="eod-senales">
              {l.senales.map((s, i) => <li key={i} className={`eod-senal eod-senal--${s.tono}`}>{s.texto}</li>)}
            </ul>
          )}
          {l.foco_manana && <div className="eod-foco"><span>Foco de mañana</span>{l.foco_manana}</div>}
          {eod.lecturaEn && <div className="eod-lectura-pie">Escrita a las {hora(eod.lecturaEn)}</div>}
        </Tarjeta>
      )}
    </section>
  )
}

function Parte({ titulo, texto }) {
  if (!texto) return null
  return <div className="eod-parte"><div className="eod-parte-titulo">{titulo}</div><p>{texto}</p></div>
}

/** Los hábitos que tocaban hoy: hechos y no. Un `hacer`/`evitar` se marca desde aquí. */
export function HabitosDelDia({ alMarcar }) {
  const { habitos, marcas, hoy } = useDatos()
  const marcasHoy = useMemo(() => (marcas || []).filter((m) => m.fecha === hoy), [marcas, hoy])
  const lista = useMemo(() => habitos
    .filter((h) => (h.cadencia === 'semana' ? estaHecho(h, marcasHoy, hoy) : tocaHoy(h, hoy)))
    .map((h) => ({ h, hecho: estaHecho(h, marcasHoy, hoy), marca: marcasHoy.find((m) => m.habitoId === h.id) })), [habitos, marcasHoy, hoy])
  const a = adherencia(habitos, marcas, hoy)
  return (
    <section className="seccion">
      <div className="seccion-titulo">Hábitos · {a.hechos}/{a.tocaban} · {a.porcentaje} %</div>
      <div className="eod-barra"><span style={{ width: `${a.porcentaje}%` }} /></div>
      <div className="eod-habitos">
        {lista.map(({ h, hecho, marca }) => (
          <button
            key={h.id}
            type="button"
            className={`eod-habito${hecho ? ' eod-habito--hecho' : ''}`}
            disabled={h.tipo === 'medir'}
            title={h.tipo === 'medir' ? 'Se apunta con su valor (arriba o en Hábitos)' : undefined}
            onClick={() => alMarcar(h, !hecho)}
          >
            <span className="eod-habito-marca">{hecho && <Check size={12} strokeWidth={3} />}</span>
            <span className="eod-habito-nombre">{h.nombre}</span>
            {h.tipo === 'medir' && marca?.valor != null && <span className="eod-habito-valor">{coma(marca.valor)} {h.unidad}</span>}
          </button>
        ))}
      </div>
    </section>
  )
}

/** Reuniones (Wispr, §14.7) y trabajo de Claude Code (§14) del día lógico. */
export function OtrosDelDia() {
  const { hoy, ajustes, avisar } = useDatos()
  const [reuniones, setReuniones] = useState(null)
  const [claude, setClaude] = useState(null)
  useEffect(() => {
    let vivo = true
    Promise.all([cargarReuniones(2), cargarDia(hoy, ajustes?.horaReinicio || '04:00')])
      .then(([r, s]) => { if (!vivo) return; setReuniones(r.filter((x) => diaDe(x.inicio) === hoy).reverse()); setClaude(s) })
      .catch((e) => avisar(e.message, 'error'))
    return () => { vivo = false }
  }, [hoy, ajustes?.horaReinicio, avisar])
  const r = claude ? resumenDia(claude) : null
  return (
    <>
      <section className="seccion">
        <div className="seccion-titulo eod-con-icono"><Mic size={14} /> Reuniones hoy · {reuniones ? reuniones.length : '…'}</div>
        {reuniones && !reuniones.length && <div className="eod-nada">Ninguna reunión registrada hoy</div>}
        <div className="eod-lista">
          {(reuniones || []).map((x) => (
            <Tarjeta key={x.id} compacta className="eod-item">
              <div className="eod-item-titulo">{x.titulo}</div>
              <div className="eod-item-sub">{hora(x.inicio)}{x.minutos ? ` · ${x.minutos} min` : ''}{x.decisiones?.length ? ` · ${x.decisiones.length} decisiones` : ''}</div>
            </Tarjeta>
          ))}
        </div>
      </section>
      <section className="seccion">
        <div className="seccion-titulo eod-con-icono">
          <Terminal size={14} /> Claude hoy{r ? ` · ${r.sesiones} sesiones · ${Math.floor(r.minutos / 60)} h ${String(r.minutos % 60).padStart(2, '0')} · ${r.hechas} hechas · ${r.abiertas} abiertas` : ''}
        </div>
        {claude && !claude.length && <div className="eod-nada">Hoy no ha trabajado ninguna terminal</div>}
        <div className="eod-lista">
          {(claude || []).map((s) => (
            <Tarjeta key={s.id} compacta className="eod-item">
              <div className="eod-item-titulo">{s.titulo}</div>
              <div className="eod-item-sub">{hora(s.inicio)}–{hora(s.fin)} · {s.pasos.length} pasos{s.tareas.length ? ` · ${s.tareas.length} tareas` : ''}</div>
            </Tarjeta>
          ))}
        </div>
      </section>
    </>
  )
}

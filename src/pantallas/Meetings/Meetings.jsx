import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Sparkles, TriangleAlert, Quote } from 'lucide-react'
import Segmentos from '../../componentes/Segmentos.jsx'
import ProximosClaude from '../Tareas/ProximosClaude.jsx'
import ReunionesClaude from '../Tareas/ReunionesClaude.jsx'
import { Bloque, Radar } from '../Fitness/Ficha.jsx'
import { Anillo, Evolucion, Kpi, Lista } from '../Estadisticas/Overview.jsx'
import { BarrasHorizontales } from '../Estadisticas/graficos.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { cargarPerfiles, pedirPerfil } from '../../datos/bitacora.js'
import { textoFecha } from '../../datos/fechas.js'
import '../Fitness/ficha.css'
import '../Estadisticas/overview.css'
import '../Tareas/claude.css'
import './meetings.css'

const DIMENSIONES = [
  { clave: 'claridad', nombre: 'Claridad' }, { clave: 'concision', nombre: 'Concisión' },
  { clave: 'escucha', nombre: 'Escucha' }, { clave: 'preguntas', nombre: 'Preguntas' },
  { clave: 'estructura', nombre: 'Estructura' }, { clave: 'liderazgo', nombre: 'Liderazgo' },
  { clave: 'cierre', nombre: 'Cierre' }, { clave: 'energia', nombre: 'Energía' },
]
const coma = (n) => String(n ?? '—').replace('.', ',')

let ultimaCara = 'perfil'

/**
 * MEETINGS (LOGICA §15): la sección de las reuniones. Tres caras: tu ficha de comunicador (IA,
 * por versiones, tan detallada como la de Fitness), las tareas que dejaron las reuniones para
 * validar, y las reuniones con su resumen.
 */
export default function Meetings() {
  const [cara, setCaraEstado] = useState(ultimaCara)
  const setCara = (c) => { ultimaCara = c; setCaraEstado(c) }
  const [porValidar, setPorValidar] = useState(0)
  const caras = [
    { valor: 'perfil', etiqueta: 'Perfil' },
    { valor: 'validar', etiqueta: porValidar ? `Por validar · ${porValidar}` : 'Por validar' },
    { valor: 'reuniones', etiqueta: 'Reuniones' },
  ]
  return (
    <div className="pantalla meetings">
      <Segmentos opciones={caras} valor={cara} alCambiar={setCara} className="meetings-caras" />
      <div className="meetings-cuerpo">
        {cara === 'perfil' && <Perfil />}
        {cara === 'validar' && <ProximosClaude soloReuniones alCambiarCuenta={setPorValidar} />}
        {cara === 'reuniones' && <ReunionesClaude alIrAProximos={() => setCara('validar')} />}
      </div>
    </div>
  )
}

function Perfil() {
  const { avisar } = useDatos()
  const [versiones, setVersiones] = useState(null)
  const [elegida, setElegida] = useState(0)

  const cargar = useCallback(async () => {
    try { setVersiones(await cargarPerfiles()) } catch (e) { setVersiones([]); avisar(e.message, 'error') }
  }, [avisar])
  useEffect(() => { cargar() }, [cargar])
  const pendiente = versiones?.find((v) => v.estado === 'pedido')
  useEffect(() => {
    if (!pendiente) return undefined
    const t = setInterval(cargar, 20000) // el Mac la escribe en unos minutos
    return () => clearInterval(t)
  }, [pendiente, cargar])

  const listas = (versiones || []).filter((v) => v.estado === 'listo')
  const version = listas[elegida] || null
  const previa = listas[elegida + 1] || null
  const f = version?.ficha
  const a = version?.metricas?.agregadas
  const fallida = versiones?.[0]?.estado === 'error' ? versiones[0] : null

  const regenerar = async () => {
    try { await pedirPerfil(); avisar('Pedida: Claude la escribe en unos minutos', 'ok'); cargar() } catch (e) { avisar(e.message, 'error') }
  }

  if (!versiones) return <p className="t-secundario ficha-vacia">Leyendo tus reuniones…</p>

  const atributos = DIMENSIONES.map((d) => ({ ...d, valor: f?.dimensiones?.find((x) => x.clave === d.clave)?.nota ?? null }))
  const fantasma = previa ? DIMENSIONES.map((d) => ({ clave: d.clave, valor: previa.ficha?.dimensiones?.find((x) => x.clave === d.clave)?.nota ?? 0 })) : []

  return (
    <div className="ficha overview">
      <section className="ficha-nucleo ov-nucleo">
        <span className="ficha-mira ficha-mira--ai" /><span className="ficha-mira ficha-mira--ad" />
        <span className="ficha-mira ficha-mira--bi" /><span className="ficha-mira ficha-mira--bd" />
        <div className="ov-cabeza">
          <div className="ov-identidad">
            <span className="ov-sello"><Sparkles size={13} strokeWidth={1.75} /> Comunicador · IA</span>
            <h2 className="ov-arquetipo">{f?.perfil?.arquetipo || 'Tu ficha de reuniones'}</h2>
            <p className="ov-titular">{f?.titular || 'Claude escucha tus reuniones de Wispr Flow y te devuelve cómo hablas, cómo diriges y qué mejorar.'}</p>
          </div>
          {f && <Anillo valor={f.nota_global} />}
        </div>
        {f && <p className="ov-resumen">{f.resumen}</p>}
        <div className="ov-acciones">
          <button type="button" className="ov-boton" onClick={regenerar} disabled={!!pendiente}>
            {pendiente ? <span className="ov-girando"><RefreshCw size={15} strokeWidth={2} /></span> : <RefreshCw size={15} strokeWidth={2} />}
            {pendiente ? 'Claude está escuchando…' : f ? 'Regenerar' : 'Generar mi ficha'}
          </button>
          {version && <span className="ov-meta">{textoFecha(version.creadaEn.slice(0, 10))} · {a?.reuniones} reuniones · confianza {f.confianza}</span>}
        </div>
        {fallida && <p className="ov-fallo"><TriangleAlert size={14} strokeWidth={1.75} /> {fallida.error}</p>}
        {listas.length > 1 && (
          <div className="ov-versiones" role="tablist" aria-label="Versiones">
            {listas.slice(0, 12).map((v, i) => (
              <button key={v.id} role="tab" aria-selected={i === elegida} className={`ov-version${i === elegida ? ' ov-version--activa' : ''}`} onClick={() => setElegida(i)}>
                v{listas.length - i}<small>{textoFecha(v.creadaEn.slice(0, 10))}</small>
              </button>
            ))}
          </div>
        )}
      </section>

      {a && (
        <div className="ov-kpis">
          <Kpi etiqueta="Tiempo que hablas" valor={`${coma(a.cuota_tiempo_media)} %`} pie={`palabras ${coma(a.cuota_palabras_media)} %`} acento />
          <Kpi etiqueta="Palabras / min" valor={coma(a.ppm_medio)} pie="ritmo medio" />
          <Kpi etiqueta="Preguntas" valor={`${coma(a.pct_preguntas_medio)} %`} pie="de tus intervenciones" />
          <Kpi etiqueta="Turno medio" valor={`${coma(a.turno_medio_s)} s`} pie={`el más largo ${a.turno_max_s} s`} />
          <Kpi etiqueta="Monólogos" valor={a.monologos_totales} pie="turnos de más de 90 s" peligro={a.monologos_totales > 3} />
          <Kpi etiqueta="Reuniones" valor={a.reuniones} pie={`${a.minutos_totales} min`} />
        </div>
      )}

      {f && (
        <Bloque titulo="Las 8 dimensiones" pie={previa ? `En acero, la versión del ${textoFecha(previa.creadaEn.slice(0, 10))}.` : 'La primera ficha es la línea de salida.'}>
          <Radar atributos={atributos} fantasma={fantasma} />
          <ul className="ov-dimensiones">
            {DIMENSIONES.map((d) => {
              const x = f.dimensiones?.find((y) => y.clave === d.clave)
              if (!x) return null
              return (
                <li key={d.clave} className="ov-dim">
                  <div className="ov-dim-linea">
                    <span className="ov-dim-nombre">{d.nombre}</span>
                    <span className="ov-dim-pista"><motion.span className="ov-dim-barra" initial={{ width: 0 }} animate={{ width: `${(x.nota / 10) * 100}%` }} transition={{ duration: 0.6 }} /></span>
                    <span className="ov-dim-cifra">{coma(x.nota)}</span>
                  </div>
                  <p className="ov-dim-lectura">{x.lectura}</p>
                </li>
              )
            })}
          </ul>
        </Bloque>
      )}

      {version?.metricas?.por_reunion?.length > 0 && (
        <Bloque titulo="Cuánto hablas en cada reunión" pie="Porcentaje del tiempo de la reunión en el que hablas tú.">
          <BarrasHorizontales
            filas={version.metricas.por_reunion.map((r, i) => ({ clave: `${i}`, nombre: `${r.fecha} · ${r.reunion}`, n: r.metricas.cuota_tiempo }))}
            colorDe={(x) => (x.n > 60 ? 'var(--aviso)' : 'var(--acento)')}
          />
        </Bloque>
      )}

      {f?.forma_de_hablar && (
        <Bloque titulo="Tu forma de hablar">
          <p className="ov-lectura ov-lectura--arriba"><b>Ritmo.</b> {f.forma_de_hablar.ritmo}</p>
          <p className="ov-lectura"><b>Vocabulario.</b> {f.forma_de_hablar.vocabulario}</p>
          {f.forma_de_hablar.muletillas?.length > 0 && (
            <>
              <h4 className="ov-sub">Muletillas · por cada mil palabras</h4>
              <BarrasHorizontales filas={f.forma_de_hablar.muletillas.map((m) => ({ clave: m.palabra, nombre: `«${m.palabra}»`, n: m.por_mil }))} colorDe={() => 'var(--acento)'} />
              <ul className="ov-lista">{f.forma_de_hablar.muletillas.map((m) => <li key={m.palabra} className="ov-item"><span className="ov-item-titulo">«{m.palabra}»</span><p>{m.lectura}</p></li>)}</ul>
            </>
          )}
        </Bloque>
      )}

      {f?.estilo_en_reuniones && (
        <Bloque titulo="Tu estilo en reuniones">
          <div className="mt-estilo">
            {[['Cómo abres', 'como_abre'], ['Cómo diriges', 'como_dirige'], ['Cómo cierras', 'como_cierra'], ['Según con quién', 'con_quien_cambia']].map(([t, k]) => (
              <div key={k} className="mt-estilo-celda"><span className="ov-sub">{t}</span><p>{f.estilo_en_reuniones[k]}</p></div>
            ))}
          </div>
        </Bloque>
      )}

      {f?.perfil && (
        <Bloque titulo="Tu perfil">
          <p className="ov-lectura ov-lectura--arriba">{f.perfil.descripcion}</p>
          <div className="ov-rejilla">
            <Lista titulo="Fortalezas" items={f.perfil.fortalezas} tono="fuerte" />
            <Lista titulo="Puntos ciegos" items={f.perfil.puntos_ciegos} tono="debil" />
          </div>
        </Bloque>
      )}

      {f?.momentos?.length > 0 && (
        <Bloque titulo="Momentos" pie="Citas literales de tus reuniones.">
          <ul className="mt-momentos">
            {f.momentos.map((m, i) => (
              <li key={i} className={`mt-momento mt-momento--${m.tono}`}>
                <Quote size={14} />
                <blockquote>{m.cita}</blockquote>
                <p>{m.por_que}</p>
                <small>{m.reunion}</small>
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {f?.patrones?.length > 0 && (
        <Bloque titulo="Patrones">
          <ul className="ov-lista">{f.patrones.map((p, i) => <li key={i} className="ov-item"><span className="ov-item-titulo">{p.titulo}</span><p>{p.detalle}</p></li>)}</ul>
        </Bloque>
      )}

      {f?.ejercicios?.length > 0 && (
        <Bloque titulo="Ejercicios para la próxima" tono="fuerte">
          <ol className="ov-lista ov-lista--numerada">
            {f.ejercicios.map((e, i) => (
              <li key={i} className="ov-item"><span className="ov-item-titulo">{e.accion}</span><p>{e.por_que}</p><p className="mt-medida">Se mide: {e.como_medirlo}</p></li>
            ))}
          </ol>
          {f.proxima_reunion && (
            <div className="ov-semana"><span className="ov-sub">Próxima reunión</span><strong>{f.proxima_reunion.foco}</strong><span>{f.proxima_reunion.objetivo_medible}</span></div>
          )}
        </Bloque>
      )}

      {listas.length > 1 && (
        <Bloque titulo="Evolución" pie="Nota global de cada versión.">
          <Evolucion versiones={[...listas].reverse()} />
          {f?.evolucion && <p className="ov-lectura">{f.evolucion}</p>}
        </Bloque>
      )}
      {listas.length <= 1 && f?.evolucion && <Bloque titulo="Evolución"><p className="ov-lectura">{f.evolucion}</p></Bloque>}
    </div>
  )
}

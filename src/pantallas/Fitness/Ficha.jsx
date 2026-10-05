import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Lock, LockOpen, TriangleAlert } from 'lucide-react'
import { useDatos } from '../../estado/useDatos.jsx'
import { deSegundos, exploracion, fichaActual, fichaInicial, ultimaMedida, vivoDe } from '../../datos/fitness.js'
import { diaDelReto } from '../../datos/retos.js'
import { textoFecha } from '../../datos/fechas.js'
import './ficha.css'

/**
 * Ficha de combate (LOGICA §12): el físico de Alex como el personaje de un juego. La escribe
 * CORE por versiones; aquí se enseña la última, con la primera de fantasma (acero) en el
 * radar. El peso y el pulso salen vivos de la base y las pruebas bloqueadas se abren solas
 * en cuanto hay una medida con su clave.
 */
export default function Ficha() {
  const { fitFichas, fitMedidas, marcas, habitos, reto, hoy } = useDatos()
  const actual = useMemo(() => fichaActual(fitFichas), [fitFichas])
  const inicial = useMemo(() => fichaInicial(fitFichas), [fitFichas])
  const ret = useMemo(() => diaDelReto(reto, hoy), [reto, hoy])
  const dominios = actual?.datos?.dominios || []
  const [elegido, setElegido] = useState(null)
  const dom = dominios.find((x) => x.clave === elegido) || dominios[0]

  if (!actual) {
    return <p className="t-secundario ficha-vacia">Todavía no hay ficha. Se crea tras analizar el primer entreno.</p>
  }

  const d = actual.datos
  const fuentes = { marcas, habitos, medidas: fitMedidas }
  const leerVivo = (clave) => {
    if (clave === 'reto') return ret.total ? { texto: `${ret.dia}/${ret.total}`, fecha: hoy } : null
    const v = vivoDe(clave, fuentes)
    return v ? { texto: String(v.valor).replace('.', ','), fecha: v.fecha } : null
  }
  const peso = leerVivo('peso')
  const pulso = leerVivo('pulso_reposo')
  const medidos = dominios.filter((x) => x.nivel != null).length
  const domV1 = inicial?.datos?.dominios?.find((x) => x.clave === dom?.clave)

  return (
    <div className="ficha">
      <section className="ficha-nucleo" aria-label="Personaje">
        <span className="ficha-mira ficha-mira--ai" aria-hidden /><span className="ficha-mira ficha-mira--ad" aria-hidden />
        <span className="ficha-mira ficha-mira--bi" aria-hidden /><span className="ficha-mira ficha-mira--bd" aria-hidden />

        <header className="ficha-cabeza">
          <div className="ficha-identidad">
            <h2 className="ficha-alias">{d.alias}</h2>
            <p className="ficha-clase">{d.clase}</p>
            <p className="ficha-meta">Ficha {actual.version} · {textoFecha(actual.fecha)} · {medidos} de {dominios.length} dominios medidos</p>
          </div>
          <Nivel valor={d.nivel} max={d.nivel_max || 10} nombre={d.nivel_nombre} />
        </header>

        <div className="ficha-hud">
          <Lectura nombre="Peso" valor={peso?.texto} unidad="kg" vivo={peso} />
          <Lectura nombre="Pulso en reposo" valor={pulso?.texto} unidad="lpm" vivo={pulso} />
          <Lectura nombre="Reto" valor={ret.total ? String(ret.dia) : null} unidad={ret.total ? `/${ret.total}` : ''} />
        </div>

        <div className="ficha-mapa" role="tablist" aria-label="Dominios">
          {dominios.map((x) => {
            const ex = exploracion(x, fitMedidas)
            const activo = x.clave === dom?.clave
            return (
              <button
                key={x.clave}
                type="button"
                role="tab"
                aria-selected={activo}
                className={`ficha-dominio${activo ? ' ficha-dominio--activo' : ''}${x.nivel == null ? ' ficha-dominio--niebla' : ''}${['alerta', 'riesgo'].includes(x.estado) ? ' ficha-dominio--alerta' : ''}`}
                onClick={() => setElegido(x.clave)}
              >
                <span className="ficha-dominio-nombre">{x.nombre}</span>
                {x.nivel != null
                  ? <span className="ficha-dominio-nivel">{String(x.nivel).replace('.', ',')}<small>/10</small></span>
                  : <span className="ficha-dominio-estado">{x.estado}</span>}
                <span className="ficha-dominio-barra" aria-hidden>
                  <span style={{ width: `${x.nivel != null ? x.nivel * 10 : 0}%` }} />
                </span>
                {ex.total > 0 && <span className="ficha-dominio-ex">{ex.abiertas}/{ex.total} pruebas</span>}
              </button>
            )
          })}
        </div>
        {d.objetivo && <p className="ficha-objetivo">{d.objetivo}</p>}
      </section>

      {dom && <Dominio key={dom.clave} dom={dom} v1={domV1} leerVivo={leerVivo} medidas={fitMedidas} escala={dom.escala || d.escala} />}

      {d.alerta && (
        <aside className="ficha-alerta">
          <TriangleAlert size={18} strokeWidth={1.75} aria-hidden />
          <div><strong>{d.alerta.titulo}</strong><p>{d.alerta.texto}</p></div>
        </aside>
      )}
    </div>
  )
}

function Lectura({ nombre, valor, unidad, vivo }) {
  return (
    <div className="ficha-lectura">
      <span className="ficha-lectura-nombre">{nombre}{vivo && <span className="ficha-vivo" title={`Dato vivo · ${textoFecha(vivo.fecha)}`} />}</span>
      <span className="ficha-lectura-valor">{valor ?? '—'}<small>{valor != null ? unidad : ''}</small></span>
      {vivo && <span className="ficha-lectura-detalle">{textoFecha(vivo.fecha)}</span>}
    </div>
  )
}

/** El detalle de un dominio: sólo pinta los bloques que el dominio trae. */
function Dominio({ dom, v1, leerVivo, medidas, escala }) {
  const atributos = dom.atributos || []
  const fantasma = v1?.atributos || []
  const valorV1 = (clave) => fantasma.find((a) => a.clave === clave)?.valor ?? null
  const hayV1 = v1 && v1 !== dom && fantasma.length > 0
  const medidosAttr = atributos.filter((a) => a.valor != null).length

  return (
    <div className="ficha-detalle">
      <section className="ficha-bloque ficha-bloque--cabeza">
        <div className="ficha-detalle-cabeza">
          <h3>{dom.nombre}</h3>
          <span className={`ficha-detalle-estado${dom.nivel != null ? ' ficha-detalle-estado--nivel' : ''}`}>
            {dom.nivel != null ? `${String(dom.nivel).replace('.', ',')} / 10` : dom.estado}
          </span>
        </div>
        {dom.resumen && <p className="ficha-detalle-resumen">{dom.resumen}</p>}
        {medidosAttr >= 3 && <Radar atributos={atributos} fantasma={hayV1 ? fantasma : []} />}
      </section>

      <div className="ficha-columnas">
        <div className="ficha-columna">
          {atributos.length > 0 && (
            <Bloque titulo="Atributos" pie={medidosAttr ? escala : 'Sin medir todavía: se rellenan cuando haya vídeo o prueba.'}>
              <ul className="ficha-atributos">
                {atributos.map((a) => <Atributo key={a.clave} a={a} v1={hayV1 ? valorV1(a.clave) : null} />)}
              </ul>
            </Bloque>
          )}

          {(dom.lecturas?.length > 0 || dom.motor?.length > 0) && (
            <Bloque titulo={dom.motor?.length ? 'Motor' : 'Datos'}>
              <ul className="ficha-filas">
                {[...(dom.motor || []), ...(dom.lecturas || [])].map((m, i) => {
                  const vivo = m.vivo ? leerVivo(m.vivo) : null
                  return (
                    <li key={i}>
                      <span className="ficha-fila-nombre">
                        <span>{m.nombre}{vivo && <span className="ficha-vivo" title="Dato vivo" />}</span>
                        {(m.detalle || vivo) && <small>{vivo ? `vivo · ${textoFecha(vivo.fecha)}${m.detalle ? ` · ${m.detalle}` : ''}` : m.detalle}</small>}
                      </span>
                      <span className="ficha-fila-valor">{vivo ? vivo.texto + (m.valor.match(/[a-z%]+$/i) ? ` ${m.valor.match(/[a-z%]+$/i)[0]}` : '') : m.valor}</span>
                    </li>
                  )
                })}
              </ul>
            </Bloque>
          )}

          {dom.sparring && (
            <Bloque titulo="Sparring" pie={dom.sparring.fuente}>
              <table className="ficha-tabla">
                <thead><tr><th scope="col" /><th scope="col">Tú</th><th scope="col">Rival</th></tr></thead>
                <tbody>
                  {dom.sparring.filas.map((f, i) => (
                    <tr key={i}><th scope="row">{f.nombre}</th><td>{f.tu}</td><td>{f.rival}</td></tr>
                  ))}
                </tbody>
              </table>
            </Bloque>
          )}
        </div>

        <div className="ficha-columna">
          {(dom.fuertes?.length > 0 || dom.debiles?.length > 0) && (
            <div className="ficha-par">
              {dom.fuertes?.length > 0 && (
                <Bloque titulo="Puntos fuertes" tono="fuerte">
                  <ul className="ficha-lista ficha-lista--fuerte">{dom.fuertes.map((t, i) => <li key={i}>{t}</li>)}</ul>
                </Bloque>
              )}
              {dom.debiles?.length > 0 && (
                <Bloque titulo="Puntos débiles" tono="debil">
                  <ul className="ficha-lista ficha-lista--debil">{dom.debiles.map((t, i) => <li key={i}>{t}</li>)}</ul>
                </Bloque>
              )}
            </div>
          )}

          {dom.estilo && (
            <Bloque titulo="Estilo">
              <dl className="ficha-estilo">
                <div><dt>En el saco</dt><dd>{dom.estilo.saco}</dd></div>
                <div><dt>En sparring</dt><dd>{dom.estilo.sparring}</dd></div>
                <div className="ficha-estilo-hueco"><dt>El hueco</dt><dd>{dom.estilo.hueco}</dd></div>
              </dl>
              {dom.estilo.referencias?.length > 0 && (
                <div className="ficha-referencias">{dom.estilo.referencias.map((r) => <span key={r}>{r}</span>)}</div>
              )}
            </Bloque>
          )}

          {dom.misiones?.length > 0 && (
            <Bloque titulo="Misiones">
              <ul className="ficha-misiones">
                {dom.misiones.map((m, i) => <li key={i} className={m.prioridad ? 'ficha-mision--prioridad' : ''}>{m.texto}</li>)}
              </ul>
            </Bloque>
          )}

          {dom.bloqueado?.length > 0 && (
            <Bloque titulo="Por desbloquear">
              <div className="ficha-casillas">
                {dom.bloqueado.map((b) => {
                  const m = ultimaMedida(medidas, b.clave)
                  const valor = m ? (b.formato === 'tiempo' ? deSegundos(m.valor) : String(m.valor).replace('.', ',')) : null
                  return (
                    <div key={b.clave} className={`ficha-casilla${m ? ' ficha-casilla--abierta' : ''}`}>
                      {m ? <LockOpen size={14} strokeWidth={1.75} aria-hidden /> : <Lock size={14} strokeWidth={1.75} aria-hidden />}
                      <span className="ficha-casilla-nombre">{b.nombre}</span>
                      <span className="ficha-casilla-valor">
                        {m ? <>{valor}<small>{b.formato === 'tiempo' ? '' : b.unidad}</small></> : textoFecha(b.fecha)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Bloque>
          )}
        </div>
      </div>
    </div>
  )
}

function Bloque({ titulo, pie, tono, children }) {
  return (
    <section className={`ficha-bloque${tono ? ` ficha-bloque--${tono}` : ''}`}>
      <h3 className="ficha-bloque-titulo">{titulo}</h3>
      {children}
      {pie && <p className="ficha-bloque-pie">{pie}</p>}
    </section>
  )
}

/** El nivel como un anillo de 10 segmentos: cada uno es un punto de la escala. */
function Nivel({ valor, max, nombre }) {
  const R = 34, C = 2 * Math.PI * R, hueco = 3
  const seg = C / max
  const lleno = Math.max(0, Math.min(max, Number(valor) || 0))
  return (
    <div className="ficha-nivel" aria-label={`Nivel ${String(valor).replace('.', ',')} de ${max}`}>
      <svg viewBox="0 0 84 84" aria-hidden>
        {Array.from({ length: max }, (_, i) => {
          const parte = Math.max(0, Math.min(1, lleno - i))
          return (
            <g key={i} transform={`rotate(${-90 + (360 / max) * i} 42 42)`}>
              <circle cx="42" cy="42" r={R} className="ficha-nivel-pista" strokeDasharray={`${seg - hueco} ${C}`} />
              {parte > 0 && <circle cx="42" cy="42" r={R} className="ficha-nivel-lleno" strokeDasharray={`${(seg - hueco) * parte} ${C}`} />}
            </g>
          )
        })}
      </svg>
      <span className="ficha-nivel-cifra">{String(valor).replace('.', ',')}<small>/{max}</small></span>
      {nombre && <span className="ficha-nivel-nombre">{nombre}</span>}
    </div>
  )
}

/** Radar de los atributos medidos (los null no entran). La v1 va debajo, en acero. */
function Radar({ atributos, fantasma }) {
  const reducir = useReducedMotion()
  const medidos = atributos.filter((a) => a.valor != null)
  const n = medidos.length
  if (n < 3) return null
  const S = 300, c = S / 2, R = 104
  const punto = (i, v) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / n
    const r = (Math.max(0, Math.min(10, v)) / 10) * R
    return [c + r * Math.cos(ang), c + r * Math.sin(ang)]
  }
  const poligono = (vals) => vals.map((v, i) => punto(i, v).join(',')).join(' ')
  const ahora = medidos.map((a) => a.valor)
  const v1 = fantasma.length ? medidos.map((a) => fantasma.find((f) => f.clave === a.clave)?.valor ?? 0) : null

  return (
    <figure className="ficha-radar">
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={medidos.map((a) => `${a.nombre} ${a.valor}`).join(', ')}>
        {[2, 4, 6, 8, 10].map((k) => (
          <polygon key={k} className={`ficha-radar-anillo${k === 10 ? ' ficha-radar-anillo--borde' : ''}`} points={poligono(Array(n).fill(k))} />
        ))}
        {medidos.map((a, i) => {
          const [x, y] = punto(i, 10)
          return <line key={a.clave} className="ficha-radar-eje" x1={c} y1={c} x2={x} y2={y} />
        })}
        {v1 && <polygon className="ficha-radar-v1" points={poligono(v1)} />}
        <motion.g
          initial={reducir ? false : { scale: 0.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ transformOrigin: `${c}px ${c}px` }}
        >
          <polygon className="ficha-radar-ahora" points={poligono(ahora)} />
          {ahora.map((v, i) => { const [x, y] = punto(i, v); return <circle key={i} className="ficha-radar-punto" cx={x} cy={y} r="3" /> })}
        </motion.g>
        {medidos.map((a, i) => {
          const [x, y] = punto(i, 12.6)
          const ancla = Math.abs(x - c) < 8 ? 'middle' : x > c ? 'start' : 'end'
          return (
            <text key={a.clave} className="ficha-radar-etiqueta" x={x} y={y} textAnchor={ancla} dominantBaseline="middle">
              <tspan>{a.nombre.split(' / ')[0]}</tspan>
              <tspan className="ficha-radar-cifra" dx="5">{String(a.valor).replace('.', ',')}</tspan>
            </text>
          )
        })}
      </svg>
      {v1 && <figcaption><span className="ficha-leyenda ficha-leyenda--ahora" />Ahora <span className="ficha-leyenda ficha-leyenda--v1" />Punto de partida</figcaption>}
    </figure>
  )
}

/** Un atributo: nombre, 10 celdas (media celda para el ,5), cifra y la nota de por qué. */
function Atributo({ a, v1 }) {
  const sin = a.valor == null
  return (
    <li className={`ficha-atributo${sin ? ' ficha-atributo--sin' : ''}`}>
      <div className="ficha-atributo-linea">
        <span className="ficha-atributo-nombre">{a.nombre}</span>
        <span className="ficha-celdas" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => {
            const parte = sin ? 0 : Math.max(0, Math.min(1, a.valor - i))
            return <span key={i} className={`ficha-celda${parte >= 1 ? ' ficha-celda--llena' : parte > 0 ? ' ficha-celda--media' : ''}${v1 != null && i < v1 ? ' ficha-celda--v1' : ''}`} />
          })}
        </span>
        <span className="ficha-atributo-cifra">
          {sin ? '¿?' : String(a.valor).replace('.', ',')}
          {v1 != null && !sin && v1 !== a.valor && <small>{a.valor > v1 ? '▲' : '▼'} {String(v1).replace('.', ',')}</small>}
        </span>
      </div>
      {a.nota && <p className="ficha-atributo-nota">{a.nota}</p>}
    </li>
  )
}

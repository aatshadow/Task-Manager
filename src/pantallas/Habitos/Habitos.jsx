import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Archive, ChevronDown, CloudOff, Pencil, Plus, RefreshCw, Repeat, Sun } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Marca from '../../componentes/Marca.jsx'
import Boton from '../../componentes/Boton.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { cargarHabitos, marcar, tocaHoy, racha, cumplimientoSemana } from '../../datos/habitos.js'
import { textoFecha, diaDe } from '../../datos/fechas.js'
import RejillaHabito, { LETRAS_DIA } from './RejillaHabito.jsx'
import FormularioHabito from './FormularioHabito.jsx'
import './habitos.css'

/**
 * Pantalla Hábitos (LOGICA §5): arriba los que tocan hoy con marca grande y racha; debajo
 * todos, cada uno con su rejilla de 4 semanas y el cumplimiento de la semana; al final
 * los archivados, plegados y sólo de lectura. Un hábito no se borra: se archiva (§3.6).
 *
 * Marcar es optimista: se pinta la marca en `marcas` del contexto, se escribe, y si falla
 * se deshace y se avisa. Hábitos y marcas vienen del contexto y se tocan en memoria con
 * `setMarcas`/`setHabitos` en vez de `recargar()`: una recarga en vuelo se comparte, y una
 * lectura pedida ANTES de escribir pisaría lo que acabamos de escribir (dos toques seguidos
 * en la rejilla dejaban el segundo sin pintar). Sólo los archivados se piden aparte (el
 * contexto no los carga porque ninguna otra pantalla los necesita).
 */
export default function Habitos() {
  const { habitos, marcas, hoy, setMarcas, setHabitos, recargar, avisar, cargando, error } = useDatos()
  const [hoja, setHoja] = useState(null)          // null | { habito: Habito|null }
  const [archivados, setArchivados] = useState(null) // null = aún no pedidos
  const [verArchivados, setVerArchivados] = useState(false)

  const deHoy = useMemo(() => habitos.filter((h) => tocaHoy(h, hoy)), [habitos, hoy])
  const marcadasHoy = useMemo(() => new Set(marcas.filter((m) => m.fecha === hoy).map((m) => m.habitoId)), [marcas, hoy])

  /* ── marcar / desmarcar, optimista ─────────────────────────────────────── */
  const alternar = useCallback(async (habito, fecha, si) => {
    const quitar = (ms) => ms.filter((m) => !(m.habitoId === habito.id && m.fecha === fecha))
    const marca = { habitoId: habito.id, fecha, nota: '', marcadoEn: new Date().toISOString() }
    setMarcas((ms) => (si ? [...quitar(ms), marca] : quitar(ms)))
    try {
      // `marcar()` devuelve la fila escrita (null al desmarcar, que ya está fuera del estado):
      // con eso basta, sin releer tareas + hábitos + marcas por cada toque.
      const real = await marcar(habito.id, fecha, si)
      if (real) setMarcas((ms) => ms.map((m) => (m.habitoId === habito.id && m.fecha === fecha ? real : m)))
    } catch (e) {
      // La inversa del parche, no una foto de antes: entre medias pudo haber otro toque.
      setMarcas((ms) => (si ? quitar(ms) : [...quitar(ms), marca]))
      avisar(e.message || 'No se pudo marcar', 'error')
    }
  }, [setMarcas, avisar])

  /* ── archivados (bajo demanda) ─────────────────────────────────────────── */
  const cargarArchivados = useCallback(async () => {
    try {
      const todos = await cargarHabitos({ incluirArchivados: true })
      setArchivados(todos.filter((h) => h.archivadoEn))
    } catch (e) {
      avisar(e.message || 'No se pudieron leer los archivados', 'error')
    }
  }, [avisar])
  useEffect(() => { if (verArchivados && archivados === null) cargarArchivados() }, [verArchivados, archivados, cargarArchivados])

  /* ── hoja de alta / edición ────────────────────────────────────────────── */
  const abrirNuevo = () => setHoja({ habito: null })
  const abrirEditar = (h) => setHoja({ habito: h })
  const cerrarHoja = () => setHoja(null)

  // El formulario ya devuelve el hábito escrito: se mete en memoria y listo. El orden por
  // `posicion` se conserva porque `crearHabito` da la siguiente y editar no la cambia.
  const alGuardado = (h) => {
    setHabitos((hs) => {
      const i = hs.findIndex((x) => x.id === h.id)
      return i === -1 ? [...hs, h] : hs.map((x) => (x.id === h.id ? h : x))
    })
    avisar(hoja?.habito ? 'Hábito guardado' : `Hábito «${h.nombre}» creado`, 'ok')
    cerrarHoja()
  }
  const alArchivado = (h) => {
    setHabitos((hs) => hs.filter((x) => x.id !== h.id))
    // Si el acordeón ya se pidió, el archivado pasa a él sin volver a la base.
    if (archivados !== null) setArchivados((a) => [...a.filter((x) => x.id !== h.id), h])
    avisar(`«${h.nombre}» archivado`, 'ok')
    cerrarHoja()
  }

  const sinHabitos = !cargando && !error && habitos.length === 0
  // Si la carga inicial falló, `habitos` queda vacío: no es «sin hábitos», es «no se pudo leer».
  const fallo = !cargando && error && habitos.length === 0

  return (
    <div className="pantalla">
      {/* ── Hoy ── */}
      <section className="seccion" style={{ marginTop: 0 }}>
        <div className="fila" style={{ marginBottom: 12 }}>
          <div className="seccion-titulo" style={{ marginBottom: 0 }}>Hoy · {textoFecha(hoy)}</div>
          <span className="espacio" />
          <Boton variante="secundario" pequeno icono={<Plus size={18} strokeWidth={1.75} />} onClick={abrirNuevo}>Hábito</Boton>
        </div>

        {cargando ? (
          <div className="t-terciario" style={{ padding: '8px 0' }}>Cargando…</div>
        ) : fallo ? (
          <Vacio
            icono={CloudOff}
            titulo="No se pudieron cargar los hábitos"
            texto={error.message || 'Revisa la conexión y vuelve a intentarlo.'}
            accion={<Boton pequeno variante="secundario" icono={<RefreshCw size={18} strokeWidth={1.75} />} onClick={() => recargar()}>Reintentar</Boton>}
          />
        ) : sinHabitos ? (
          <Vacio
            icono={Repeat}
            titulo="Sin hábitos todavía"
            texto="Crea el primero: algo pequeño que quieras repetir."
            accion={<Boton pequeno icono={<Plus size={18} strokeWidth={1.75} />} onClick={abrirNuevo}>Hábito</Boton>}
          />
        ) : deHoy.length === 0 ? (
          <Vacio icono={Sun} titulo="Hoy no toca ninguno" texto="Día libre. Mañana seguimos." />
        ) : (
          <div className="habitos-hoy">
            {deHoy.map((h) => {
              const hecha = marcadasHoy.has(h.id)
              const n = racha(h, marcas, hoy)
              return (
                <motion.div
                  key={h.id}
                  className={`habito-fila ${hecha ? 'habito-fila--hecha' : ''}`}
                  style={{ '--habito-color': h.color }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${h.nombre}: ${hecha ? 'hecho hoy' : 'pendiente'}`}
                  onClick={() => alternar(h, hoy, !hecha)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(h, hoy, !hecha) } }}
                  whileTap={{ scale: 0.98 }}
                  layout
                >
                  <Marca grande hecha={hecha} color={h.color} alCambiar={(si) => alternar(h, hoy, si)} aria-label={`Marcar ${h.nombre}`} />
                  <span className="habito-icono" aria-hidden="true">{h.icono || '•'}</span>
                  <div className="habito-textos">
                    <div className="habito-nombre">{h.nombre}</div>
                    <div className="habito-cadencia">{textoCadencia(h)}</div>
                  </div>
                  <span className={`habito-racha ${n > 0 ? 'habito-racha--viva' : ''}`} title={tituloRacha(h)}>{textoRacha(h, n)}</span>
                </motion.div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Todos ── */}
      {habitos.length > 0 && (
        <section className="seccion">
          <div className="seccion-titulo">Todos · últimas 4 semanas</div>
          <div className="habitos-todos">
            {habitos.map((h) => {
              const { hechas, objetivo } = cumplimientoSemana(h, marcas, hoy)
              const n = racha(h, marcas, hoy)
              return (
                <Tarjeta key={h.id} className="habito-tarjeta" style={{ '--habito-color': h.color }}>
                  <div className="habito-tarjeta-cabeza">
                    <span className="habito-icono" aria-hidden="true">{h.icono || '•'}</span>
                    <div className="habito-textos">
                      <div className="habito-nombre">{h.nombre}</div>
                      <div className="habito-cadencia">{textoCadencia(h)}</div>
                    </div>
                    <span className={`habito-racha ${n > 0 ? 'habito-racha--viva' : ''}`} title={tituloRacha(h)}>{textoRacha(h, n)}</span>
                    <button type="button" className="habito-editar" aria-label={`Editar ${h.nombre}`} onClick={() => abrirEditar(h)}>
                      <Pencil size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                  <RejillaHabito habito={h} marcas={marcas} hoy={hoy} alAlternar={(fecha, si) => alternar(h, fecha, si)} />
                  <div className="habito-tarjeta-pie">
                    <span className={`habito-cumplimiento ${hechas >= objetivo ? 'habito-cumplimiento--pleno' : ''}`}>
                      Esta semana <strong>{hechas}/{objetivo}</strong>
                    </span>
                    <span className="t-terciario">{objetivo === 0 ? '' : hechas >= objetivo ? 'Objetivo cumplido' : `${objetivo - hechas} por hacer`}</span>
                  </div>
                </Tarjeta>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Archivados (sólo lectura) ── */}
      <section className="seccion">
        <button
          type="button"
          className="habitos-archivados-cabeza"
          aria-expanded={verArchivados}
          onClick={() => setVerArchivados((v) => !v)}
        >
          <span className="fila" style={{ gap: 8 }}><Archive size={16} strokeWidth={1.75} /> Archivados{archivados ? ` · ${archivados.length}` : ''}</span>
          <ChevronDown size={18} strokeWidth={1.75} />
        </button>
        <AnimatePresence initial={false}>
          {verArchivados && (
            <motion.div
              className="habitos-archivados-lista"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {archivados === null ? (
                <div className="t-terciario" style={{ padding: '8px 0' }}>Cargando…</div>
              ) : archivados.length === 0 ? (
                <div className="t-terciario" style={{ padding: '8px 0' }}>Nada archivado.</div>
              ) : archivados.map((h) => (
                <div key={h.id} className="habito-archivado" style={{ '--habito-color': h.color }}>
                  <span className="habito-icono" aria-hidden="true">{h.icono || '•'}</span>
                  <div className="habito-textos">
                    <div className="habito-nombre">{h.nombre}</div>
                    <div className="habito-cadencia">{textoCadencia(h)} · archivado el {textoFecha(diaDe(h.archivadoEn))}</div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <FormularioHabito
        abierta={Boolean(hoja)}
        habito={hoja?.habito || null}
        alCerrar={cerrarHoja}
        alGuardado={alGuardado}
        alArchivado={alArchivado}
        avisar={avisar}
      />
    </div>
  )
}

/**
 * La racha de un hábito «X por semana» son SEMANAS seguidas, no días (así la cuenta
 * `racha()`); se dice para que un «🔥 3» no se lea como tres días.
 */
function textoRacha(h, n) {
  return h.cadencia === 'semana' ? `🔥 ${n} sem` : `🔥 ${n}`
}
function tituloRacha(h) {
  return h.cadencia === 'semana' ? 'Semanas seguidas' : 'Días seguidos'
}

/** «Cada día» · «L, X, V» · «3 veces por semana»: la cadencia en una línea. */
function textoCadencia(h) {
  if (h.cadencia === 'dias') return (h.dias || []).map((d) => LETRAS_DIA[d - 1]).join(', ') || 'Ningún día'
  if (h.cadencia === 'semana') return h.vecesSemana === 1 ? '1 vez por semana' : `${h.vecesSemana} veces por semana`
  return 'Cada día'
}

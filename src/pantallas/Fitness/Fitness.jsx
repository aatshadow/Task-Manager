import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Dumbbell } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { anotarSesion, medidasDe, medir, progreso, sesionDe, textoDeValor, valorDeTexto } from '../../datos/fitness.js'
import { nombreDia, textoFecha } from '../../datos/fechas.js'
import './fitness.css'

/**
 * Pantalla Fitness (LOGICA §11.2): la sesión de hoy arriba y abierta —los ejercicios del
 * día y un campo por cada cosa que se mide—, debajo los próximos días y los anteriores,
 * plegados con su «3/5». Un día pasado se puede abrir y completar después.
 *
 * Las sesiones las escribe CORE; aquí sólo se apuntan las medidas y la nota. Escribir y
 * salir del campo guarda: se pinta primero, se escribe después y, si la base dice que
 * no, vuelve lo de antes y se avisa (el patrón de las marcas de los hábitos).
 */
export default function Fitness() {
  const { fitSesiones, fitMedidas, setFitMedidas, setFitSesiones, hoy, avisar, cargando } = useDatos()

  const deHoy = useMemo(() => sesionDe(fitSesiones, hoy), [fitSesiones, hoy])
  const proximas = useMemo(() => fitSesiones.filter((s) => s.fecha > hoy), [fitSesiones, hoy])
  const anteriores = useMemo(() => fitSesiones.filter((s) => s.fecha < hoy).reverse(), [fitSesiones, hoy])

  const guardarMedida = async (fecha, clave, valor) => {
    const esEsta = (m) => m.fecha === fecha && m.clave === clave
    const anterior = fitMedidas.find(esEsta) || null
    const optimista = valor == null ? null : { fecha, clave, valor, marcadoEn: new Date().toISOString() }
    setFitMedidas((ms) => (optimista ? [...ms.filter((m) => !esEsta(m)), optimista] : ms.filter((m) => !esEsta(m))))
    try {
      const real = await medir(fecha, clave, valor)
      if (real) setFitMedidas((ms) => ms.map((m) => (esEsta(m) ? real : m)))
    } catch (e) {
      setFitMedidas((ms) => {
        const sinEsta = ms.filter((m) => !esEsta(m))
        return anterior ? [...sinEsta, anterior] : sinEsta
      })
      avisar(e.message || 'No se pudo guardar la medida', 'error')
    }
  }

  const guardarNota = async (sesion, nota) => {
    setFitSesiones((ss) => ss.map((s) => (s.id === sesion.id ? { ...s, nota } : s)))
    try {
      await anotarSesion(sesion.id, nota)
    } catch (e) {
      setFitSesiones((ss) => ss.map((s) => (s.id === sesion.id ? { ...s, nota: sesion.nota } : s)))
      avisar(e.message || 'No se pudo guardar la nota', 'error')
    }
  }

  if (!fitSesiones.length) {
    return (
      <div className="pantalla fitness">
        {cargando
          ? <p className="t-secundario">Cargando…</p>
          : <Vacio icono={Dumbbell} titulo="Sin sesiones" texto="Todavía no hay ninguna sesión cargada." />}
      </div>
    )
  }

  const tarjeta = (s, abierta = false) => (
    <SesionFit
      key={s.id}
      sesion={s}
      medidas={fitMedidas}
      esHoy={s.fecha === hoy}
      abiertaAlEntrar={abierta}
      alMedir={(clave, valor) => guardarMedida(s.fecha, clave, valor)}
      alAnotar={(nota) => guardarNota(s, nota)}
      alError={(texto) => avisar(texto, 'error')}
    />
  )

  return (
    <div className="pantalla fitness">
      <section className="fit-grupo">
        <div className="seccion-titulo">Hoy · {textoFecha(hoy, true)}</div>
        {deHoy
          ? tarjeta(deHoy, true)
          : <Tarjeta compacta><span className="t-secundario">Hoy no hay sesión.</span></Tarjeta>}
      </section>

      {proximas.length > 0 && (
        <section className="seccion fit-grupo">
          <div className="seccion-titulo">Próximos días</div>
          {proximas.map((s) => tarjeta(s))}
        </section>
      )}

      {anteriores.length > 0 && (
        <section className="seccion fit-grupo">
          <div className="seccion-titulo">Anteriores</div>
          {anteriores.map((s) => tarjeta(s))}
        </section>
      )}
    </div>
  )
}

/** Una sesión: cabeza (día, título, «3/5») y, desplegada, los ejercicios, las medidas y la nota. */
function SesionFit({ sesion, medidas, esHoy, abiertaAlEntrar, alMedir, alAnotar, alError }) {
  const [abierta, setAbierta] = useState(abiertaAlEntrar)
  const [nota, setNota] = useState(sesion.nota)
  useEffect(() => { setNota(sesion.nota) }, [sesion.nota])

  const puestas = useMemo(() => medidasDe(medidas, sesion.fecha), [medidas, sesion.fecha])
  const { hechas, total } = useMemo(() => progreso(sesion, medidas), [sesion, medidas])
  const completa = total > 0 && hechas >= total

  const salirDeNota = () => {
    const n = String(nota).trim()
    if (n !== sesion.nota) alAnotar(n)
  }

  return (
    <Tarjeta className={`fit-sesion${esHoy ? ' fit-sesion--hoy' : ''}`}>
      <button type="button" className="fit-cabeza" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta}>
        <span className="fit-dia">
          <span className="fit-dia-letra">{nombreDia(sesion.fecha).slice(0, 3)}</span>
          <span className="fit-dia-numero">{Number(sesion.fecha.slice(8, 10))}</span>
        </span>
        <span className="fit-textos">
          <span className="fit-titulo">{sesion.titulo}</span>
          <span className="fit-meta">{textoFecha(sesion.fecha)}{esHoy ? ' · hoy' : ''}</span>
        </span>
        {total > 0 && <span className={`fit-cuenta${completa ? ' fit-cuenta--completa' : ''}`}>{hechas}/{total}</span>}
        <motion.span className="fit-flecha" animate={{ rotate: abierta ? 180 : 0 }} transition={{ duration: 0.18 }}><ChevronDown size={18} strokeWidth={1.75} /></motion.span>
      </button>

      <AnimatePresence initial={false}>
        {abierta && (
          <motion.div
            key="cuerpo"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="fit-cuerpo">
              {sesion.lineas.length > 0 && (
                <ol className="fit-lineas">
                  {sesion.lineas.map((l, i) => <li key={i}>{l}</li>)}
                </ol>
              )}

              {sesion.pruebas.length > 0 && (
                <div className="fit-pruebas">
                  <div className="fit-subtitulo">Medidas</div>
                  {sesion.pruebas.map((p) => (
                    <CampoPrueba key={p.clave} prueba={p} valor={puestas[p.clave] ?? null} alGuardar={(v) => alMedir(p.clave, v)} alError={alError} />
                  ))}
                </div>
              )}

              <textarea
                className="fit-nota"
                rows={2}
                placeholder="Nota: sensaciones, molestias, lo que no cuadre…"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                onBlur={salirDeNota}
                aria-label={`Nota de ${sesion.titulo}`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Tarjeta>
  )
}

/**
 * Una prueba: nombre, campo y unidad, y debajo la referencia. Salir del campo (o Enter)
 * guarda; vaciarlo borra la medida; algo que no es un número se avisa y se deshace.
 */
function CampoPrueba({ prueba, valor, alGuardar, alError }) {
  const [texto, setTexto] = useState(() => textoDeValor(prueba, valor))
  useEffect(() => { setTexto(textoDeValor(prueba, valor)) }, [prueba, valor])

  const salir = () => {
    const n = valorDeTexto(prueba, texto)
    if (Number.isNaN(n)) {
      alError(prueba.formato === 'tiempo' ? `«${texto}» no es un tiempo: escríbelo como 12:30` : `«${texto}» no es un número`)
      setTexto(textoDeValor(prueba, valor))
      return
    }
    if (n === valor) { setTexto(textoDeValor(prueba, valor)); return }
    alGuardar(n)
  }

  const puesta = valor != null
  return (
    <label className={`fit-prueba${puesta ? ' fit-prueba--puesta' : ''}`}>
      <span className="fit-prueba-textos">
        <span className="fit-prueba-nombre">{prueba.nombre}{prueba.opcional && <span className="fit-prueba-opcional"> · opcional</span>}</span>
        {prueba.ref && <span className="fit-prueba-ref">{prueba.ref}</span>}
      </span>
      <span className="fit-prueba-campo">
        <input
          type="text"
          inputMode={prueba.formato === 'tiempo' ? 'text' : 'decimal'}
          placeholder={prueba.formato === 'tiempo' ? '0:00' : '—'}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={salir}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          aria-label={`${prueba.nombre} en ${prueba.unidad || 'unidades'}`}
        />
        <span className="fit-prueba-unidad">{prueba.unidad}</span>
      </span>
    </label>
  )
}

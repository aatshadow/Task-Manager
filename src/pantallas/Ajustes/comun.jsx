import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import Boton from '../../componentes/Boton.jsx'
import { useDatos } from '../../estado/useDatos.jsx'

/**
 * Piezas que comparten las secciones de Ajustes. Todas las secciones siguen el mismo
 * patrón: se pinta el cambio al instante (optimismo), se escribe, y si falla se vuelve
 * atrás y se avisa. Los catálogos viven en el contexto y no tienen setter (sólo
 * `ajustes` lo tiene), así que tras escribir se recargan con `recargar({ catalogos })`.
 */

/** `guardar(accion, { exito })`: ejecuta, recarga catálogos y avisa. Devuelve null si falla. */
export function usarGuardarCatalogo() {
  const { avisar, recargar } = useDatos()
  return useCallback(async (accion, { catalogos = true, exito = null, alFallar = null } = {}) => {
    try {
      const r = await accion()
      if (catalogos) await recargar({ catalogos: true })
      if (exito) avisar(exito, 'ok')
      return r ?? true
    } catch (e) {
      alFallar?.()
      avisar(e?.message || 'No se pudo guardar', 'error')
      return null
    }
  }, [avisar, recargar])
}

/**
 * `encolar(accion, { alFallar })`: escrituras que NO pueden solaparse (renumerar posiciones
 * con ▲▼: dos toques rápidos lanzarían dos tandas de updates entrelazadas y la base
 * acabaría con posiciones mezcladas). Cada acción espera a la anterior; los catálogos
 * se recargan UNA vez cuando la cola se vacía, y no tras cada escritura, para que la
 * recarga intermedia no pise en pantalla el orden que ya se ha tocado después.
 */
export function usarCola() {
  const { avisar, recargar } = useDatos()
  const cola = useRef(Promise.resolve())
  const pendientes = useRef(0)
  return useCallback((accion, { alFallar = null } = {}) => {
    pendientes.current += 1
    cola.current = cola.current
      .then(accion)
      .catch((e) => { alFallar?.(); avisar(e?.message || 'No se pudo guardar', 'error') })
      .then(() => {
        pendientes.current -= 1
        if (pendientes.current === 0) return recargar({ catalogos: true })
      })
    return cola.current
  }, [avisar, recargar])
}

/**
 * Copia local de una lista del contexto para pintar reordenaciones y ediciones antes de
 * que vuelva la recarga. Cuando el contexto cambia, la copia se vuelve a alinear.
 */
export function usarListaOptimista(fuente) {
  const [lista, setLista] = useState(fuente)
  useEffect(() => { setLista(fuente) }, [fuente])
  return [lista, setLista]
}

/** Intercambia el elemento `i` con el `i + delta` (delta ±1); fuera de rango devuelve la misma lista. */
export function moverEn(lista, i, delta) {
  const j = i + delta
  if (i < 0 || j < 0 || i >= lista.length || j >= lista.length) return lista
  const copia = lista.slice()
  ;[copia[i], copia[j]] = [copia[j], copia[i]]
  return copia
}

/**
 * Escribe `posicion = índice` en los elementos cuya posición no coincide. Se renumeran
 * todos los desplazados y no sólo los dos intercambiados: las posiciones de la base no
 * tienen por qué ser contiguas, y con huecos un intercambio a medias desordena.
 */
export async function sincronizarPosiciones(lista, escribir) {
  for (let i = 0; i < lista.length; i += 1) {
    if (lista[i].posicion !== i) await escribir(lista[i].id, i)
  }
}

/**
 * Nombre editable en línea: se guarda al soltar el foco o con Enter; Escape deshace. Un
 * valor vacío no se guarda (vuelve al anterior) salvo que `vacioVale`.
 */
export function EntradaInline({ valor, alGuardar, vacioVale = false, className = '', ...resto }) {
  const [v, setV] = useState(valor ?? '')
  useEffect(() => { setV(valor ?? '') }, [valor])
  const soltar = () => {
    const n = v.trim()
    if (!n && !vacioVale) { setV(valor ?? ''); return }
    if (n !== (valor ?? '')) alGuardar?.(n)
  }
  return (
    <input
      className={`ajustes-inline ${className}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={soltar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          // Dentro de una hoja, Escape también la cerraría (Hoja escucha en window):
          // aquí sólo deshace el campo.
          e.stopPropagation()
          setV(valor ?? '')
          requestAnimationFrame(() => e.target.blur())
        }
      }}
      enterKeyHint="done"
      {...resto}
    />
  )
}

const ESPERA_COLOR = 500

/**
 * Círculo de color con el selector nativo del sistema. El `input type=color` dispara un
 * evento por cada movimiento dentro del selector: se pinta al vuelo y se escribe medio
 * segundo después del último cambio, para no hacer una escritura por píxel.
 */
export function Color({ valor, alCambiar, etiqueta = 'Color' }) {
  const [v, setV] = useState(valor || '#8a8f98')
  const temporizador = useRef(null)
  const ultimoEscrito = useRef(valor)
  useEffect(() => { setV(valor || '#8a8f98'); ultimoEscrito.current = valor }, [valor])
  useEffect(() => () => clearTimeout(temporizador.current), [])
  const cambiar = (e) => {
    const nuevo = e.target.value
    setV(nuevo)
    clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => {
      if (nuevo !== ultimoEscrito.current) { ultimoEscrito.current = nuevo; alCambiar?.(nuevo) }
    }, ESPERA_COLOR)
  }
  return (
    <span className="ajustes-color" style={{ background: v }}>
      <input type="color" value={v} onChange={cambiar} aria-label={etiqueta} />
    </span>
  )
}

/** Botón pequeño de fila (30px, sin fondo). `peligro` lo pinta rojo al pasar. */
export function MiniBoton({ icono, etiqueta, peligro = false, className = '', ...resto }) {
  return (
    <Boton
      variante="fantasma"
      icono={icono}
      aria-label={etiqueta}
      title={etiqueta}
      className={`ajustes-mini ${peligro ? 'ajustes-mini--peligro' : ''} ${className}`}
      {...resto}
    />
  )
}

/** Los dos botones ▲▼ de reordenar. */
export function Orden({ arriba, abajo, puedeSubir = true, puedeBajar = true }) {
  return (
    <>
      <MiniBoton icono={<ChevronUp size={16} strokeWidth={1.75} />} etiqueta="Subir" onClick={arriba} disabled={!puedeSubir} />
      <MiniBoton icono={<ChevronDown size={16} strokeWidth={1.75} />} etiqueta="Bajar" onClick={abajo} disabled={!puedeBajar} />
    </>
  )
}

/** Confirmación en línea (nada de window.confirm): texto, campos opcionales y dos botones. */
export function Confirmar({ texto, children, etiqueta = 'Borrar', alConfirmar, alCancelar, ocupado = false }) {
  return (
    <div className="ajustes-confirmar" role="alertdialog" aria-label={texto}>
      <div>{texto}</div>
      {children}
      <div className="fila">
        <Boton variante="fantasma" pequeno onClick={alCancelar} disabled={ocupado}>Cancelar</Boton>
        <Boton pequeno className="boton--borrar" onClick={alConfirmar} cargando={ocupado}>{etiqueta}</Boton>
      </div>
    </div>
  )
}

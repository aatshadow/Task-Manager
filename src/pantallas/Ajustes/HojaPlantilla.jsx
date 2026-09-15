import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import Hoja from '../../componentes/Hoja.jsx'
import Campo from '../../componentes/Campo.jsx'
import Boton from '../../componentes/Boton.jsx'
import Chip from '../../componentes/Chip.jsx'
import Selector from '../../componentes/Selector.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as plantillas from '../../datos/plantillas.js'
import { EntradaInline, MiniBoton, moverEn } from './comun.jsx'

/**
 * Edición de una plantilla propia (o lectura de una de la agencia). Nombre y descripción
 * guardan al soltar el foco; los ítems guardan en cada cambio con la lista completa
 * (`guardarItems`), en cola para que dos cambios seguidos no se pisen.
 *
 * Un ítem nuevo va SIN id (lo pone la base; `guardarItems` manda `missing=default`):
 * `crypto.randomUUID` no existe fuera de HTTPS/localhost, y probar desde el móvil contra
 * el Mac por IP es http. Hasta que vuelva la fila releída, el ítem lleva una clave
 * temporal `_tmp` que sólo sirve para el `key` de React y para saber cuál está abierto.
 *
 * `alCambiar` recibe un PARCHE (`{ id, ...campos }`), nunca la plantilla entera: la
 * cabecera y los ítems se escriben por separado y en vuelo, y mandar el objeto completo
 * pisaría con un cierre viejo lo que la otra escritura ya guardó.
 */
export default function HojaPlantilla({ plantilla, abierta, alCerrar, alCambiar }) {
  const ultima = useRef(null)
  if (plantilla) ultima.current = plantilla
  const p = plantilla || ultima.current
  return (
    <Hoja
      abierta={abierta && Boolean(plantilla)}
      alCerrar={alCerrar}
      titulo={p?.soloLectura ? 'Plantilla de la agencia' : 'Plantilla'}
      pie={<Boton variante="secundario" onClick={alCerrar}>Listo</Boton>}
    >
      {p && <Contenido key={p.id} plantilla={p} alCambiar={alCambiar} />}
    </Hoja>
  )
}

/** La clave de un ítem en pantalla: su id, o la temporal mientras nace. */
const claveItem = (it) => it.id || it._tmp
let contadorTmp = 0

function Contenido({ plantilla: p, alCambiar }) {
  const { categorias, listaCuadrantes, avisar, nombreCategoria, colorCategoria, cuadrantes } = useDatos()
  const soloLectura = p.soloLectura
  const [descripcion, setDescripcion] = useState(p.descripcion || '')
  const [items, setItems] = useState(p.items)
  const [abiertoId, setAbiertoId] = useState(null)
  const [tituloNuevo, setTituloNuevo] = useState('')
  const cola = useRef(Promise.resolve())
  const tanda = useRef(0)                     // sólo el resultado de la última escritura pinta
  // Si la descripción cambia por detrás (p. ej. una escritura fallida repuso la anterior)
  // el borrador se realinea.
  useEffect(() => { setDescripcion(p.descripcion || '') }, [p.descripcion])

  const opcionesCategoria = useMemo(() => categorias.map((c) => ({ valor: c.clave, etiqueta: c.nombre, color: c.color })), [categorias])
  const opcionesCuadrante = useMemo(() => listaCuadrantes.map((q) => ({ valor: q.clave, etiqueta: q.nombre, color: q.color })), [listaCuadrantes])

  /* ── cabecera: nombre y descripción ────────────────────────────────────── */
  const escribirCabecera = async (cambios) => {
    try {
      const nueva = await plantillas.actualizarPlantilla(p.id, cambios)
      // Sólo la cabecera: los ítems los gobierna su propia cola.
      if (nueva) alCambiar({ id: p.id, origen: p.origen, nombre: nueva.nombre, descripcion: nueva.descripcion })
    } catch (e) {
      avisar(e?.message || 'No se pudo guardar', 'error')
    }
  }

  /* ── ítems: lista completa en cada cambio, en cola ─────────────────────── */
  const escribirItems = (nuevos) => {
    const antes = items
    const mia = ++tanda.current
    setItems(nuevos)
    cola.current = cola.current
      .then(() => plantillas.guardarItems(p.id, nuevos))
      .then((guardados) => {
        // lo releído manda (posiciones normalizadas, títulos vacíos fuera), pero si ya hay
        // otra escritura en cola no se pisa lo que el usuario ve con un resultado viejo
        if (mia !== tanda.current) return
        setItems(guardados)
        // El ítem recién nacido ya tiene id: si estaba abierto con su clave temporal, se
        // sigue por posición (lo devuelto va en el mismo orden que lo mandado).
        setAbiertoId((a) => {
          if (!a || !String(a).startsWith('tmp:')) return a
          const idx = nuevos.findIndex((i) => claveItem(i) === a)
          return guardados[idx]?.id ?? null
        })
        alCambiar({ id: p.id, origen: p.origen, items: guardados })
      })
      .catch((e) => {
        if (mia === tanda.current) setItems(antes)
        avisar(e?.message || 'No se pudieron guardar los ítems', 'error')
      })
  }
  const editarItem = (clave, cambios) => escribirItems(items.map((i) => (claveItem(i) === clave ? { ...i, ...cambios } : i)))
  const quitarItem = (clave) => { if (abiertoId === clave) setAbiertoId(null); escribirItems(items.filter((i) => claveItem(i) !== clave)) }
  const moverItem = (i, delta) => {
    const nuevos = moverEn(items, i, delta)
    if (nuevos !== items) escribirItems(nuevos.map((x, k) => ({ ...x, posicion: k })))
  }
  const anadirItem = (e) => {
    e?.preventDefault()
    const titulo = tituloNuevo.trim()
    if (!titulo) return
    contadorTmp += 1
    const nuevo = { _tmp: `tmp:${contadorTmp}`, titulo, descripcion: '', categoria: null, cuadrante: null, grupo: null, diasOffset: 0, posicion: items.length }
    escribirItems([...items, nuevo])
    setTituloNuevo('')
    setAbiertoId(nuevo._tmp)
  }

  return (
    <div className="ajustes-hoja">
      {soloLectura ? (
        <div>
          <div className="t-titulo">{p.nombre}</div>
          {p.descripcion && <p className="t-secundario ajustes-hoja-desc">{p.descripcion}</p>}
          <p className="ajustes-ayuda">Viene de las plantillas de GrowthInfo: se usa, no se edita.</p>
        </div>
      ) : (
        <>
          <div className="campo">
            <div className="campo-etiqueta">Nombre</div>
            <EntradaInline className="ajustes-hoja-nombre" valor={p.nombre} alGuardar={(nombre) => escribirCabecera({ nombre })} aria-label="Nombre de la plantilla" />
          </div>
          <Campo
            etiqueta="Descripción"
            multilinea
            placeholder="Para qué sirve"
            valor={descripcion}
            alCambiar={setDescripcion}
            onBlur={() => { if (descripcion !== (p.descripcion || '')) escribirCabecera({ descripcion }) }}
          />
        </>
      )}

      <div>
        <div className="seccion-titulo">Ítems ({items.length})</div>
        {items.length === 0 ? (
          <Vacio titulo="Sin ítems" texto="Cada ítem nace como una tarea al usar la plantilla." />
        ) : (
          <ul className="ajustes-items">
            {items.map((it, i) => { const k = claveItem(it); return (
              <li key={k} className="ajustes-item">
                <div className="ajustes-item-cabeza">
                  {!soloLectura && (
                    <div className="ajustes-item-orden">
                      <MiniBoton icono={<ChevronUp size={14} strokeWidth={1.75} />} etiqueta="Subir" onClick={() => moverItem(i, -1)} disabled={i === 0} />
                      <MiniBoton icono={<ChevronDown size={14} strokeWidth={1.75} />} etiqueta="Bajar" onClick={() => moverItem(i, 1)} disabled={i === items.length - 1} />
                    </div>
                  )}
                  {soloLectura ? (
                    <div className="ajustes-item-titulo ajustes-item-titulo--lectura">{it.titulo}</div>
                  ) : (
                    <EntradaInline className="ajustes-item-titulo" valor={it.titulo} alGuardar={(titulo) => editarItem(k, { titulo })} aria-label="Título del ítem" />
                  )}
                  <MiniBoton
                    icono={abiertoId === k ? <ChevronUp size={16} strokeWidth={1.75} /> : <ChevronDown size={16} strokeWidth={1.75} />}
                    etiqueta={abiertoId === k ? 'Plegar' : 'Desplegar'}
                    onClick={() => setAbiertoId((a) => (a === k ? null : k))}
                    aria-expanded={abiertoId === k}
                  />
                  {!soloLectura && <MiniBoton icono={<X size={16} strokeWidth={1.75} />} etiqueta="Quitar ítem" peligro onClick={() => quitarItem(k)} />}
                </div>

                {abiertoId !== k && (it.categoria || it.cuadrante || it.grupo || it.diasOffset) ? (
                  <div className="ajustes-item-resumen">
                    {it.categoria && <Chip pequeno color={colorCategoria(it.categoria) || 'var(--texto-2)'}>{nombreCategoria(it.categoria) || it.categoria}</Chip>}
                    {it.cuadrante && <Chip pequeno color={cuadrantes[it.cuadrante]?.color}>{cuadrantes[it.cuadrante]?.nombre || it.cuadrante}</Chip>}
                    {it.grupo && <Chip pequeno punto={false} color="var(--texto-2)">{it.grupo}</Chip>}
                    {it.diasOffset ? <Chip pequeno punto={false} color="var(--texto-2)">día {it.diasOffset > 0 ? '+' : ''}{it.diasOffset}</Chip> : null}
                  </div>
                ) : null}

                {abiertoId === k && (
                  <div className="ajustes-item-campos">
                    {soloLectura ? (
                      <Lectura item={it} nombreCategoria={nombreCategoria} cuadrantes={cuadrantes} />
                    ) : (
                      <>
                        <CampoConBlur etiqueta="Descripción" multilinea placeholder="Sin descripción" valor={it.descripcion || ''} alSoltar={(descripcion) => editarItem(k, { descripcion })} />
                        <Selector etiqueta="Categoría" opciones={opcionesCategoria} valor={it.categoria} alCambiar={(c) => editarItem(k, { categoria: c || null })} permitirVacio />
                        <Selector etiqueta="Cuadrante" opciones={opcionesCuadrante} valor={it.cuadrante} alCambiar={(q) => editarItem(k, { cuadrante: q || null })} permitirVacio />
                        <div className="rejilla-2">
                          <CampoConBlur etiqueta="Grupo (fase)" placeholder="Opcional" valor={it.grupo || ''} alSoltar={(grupo) => editarItem(k, { grupo: grupo || null })} />
                          <CampoConBlur
                            etiqueta="Desfase de días"
                            type="number"
                            inputMode="numeric"
                            valor={String(it.diasOffset ?? 0)}
                            normalizar={enteroTexto}
                            alSoltar={(v) => editarItem(k, { diasOffset: Number.parseInt(v, 10) })}
                            ayuda="Vence = fecha base + días"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            ) })}
          </ul>
        )}

        {!soloLectura && (
          <form className="ajustes-anadir" onSubmit={anadirItem}>
            <Campo placeholder="Nuevo ítem" valor={tituloNuevo} alCambiar={setTituloNuevo} aria-label="Nuevo ítem" enterKeyHint="done" />
            <Boton type="submit" variante="secundario" disabled={!tituloNuevo.trim()}>Añadir</Boton>
          </form>
        )}
      </div>
    </div>
  )
}

/**
 * Campo con borrador local que sólo escribe al soltar el foco (como la hoja de detalle).
 * Si `valor` cambia por detrás (escritura fallida que repone, o el servidor normaliza:
 * «abc» en el desfase se guarda como 0) el borrador se realinea y no miente.
 */
function CampoConBlur({ valor, alSoltar, normalizar = null, ...resto }) {
  const [v, setV] = useState(valor ?? '')
  useEffect(() => { setV(valor ?? '') }, [valor])
  return (
    <Campo
      {...resto}
      valor={v}
      alCambiar={setV}
      onBlur={() => {
        // `normalizar` repinta lo que de verdad se va a guardar (p. ej. «abc» → «0»)
        // aunque coincida con lo guardado y no haya escritura que realinee.
        const n = normalizar ? normalizar(v) : v
        if (n !== v) setV(n)
        if (n !== (valor ?? '')) alSoltar(n)
      }}
    />
  )
}

/** Un entero como texto; lo que no lo sea es 0. */
const enteroTexto = (v) => { const n = Number.parseInt(v, 10); return String(Number.isInteger(n) ? n : 0) }

function Lectura({ item, nombreCategoria, cuadrantes }) {
  return (
    <div className="ajustes-item-lectura columna">
      {item.descripcion ? <div>{item.descripcion}</div> : <div className="t-terciario">Sin descripción</div>}
      <div>Categoría: {item.categoria ? nombreCategoria(item.categoria) || item.categoria : '—'}</div>
      <div>Cuadrante: {item.cuadrante ? cuadrantes[item.cuadrante]?.nombre || item.cuadrante : '—'}</div>
      <div>Grupo: {item.grupo || '—'}</div>
    </div>
  )
}

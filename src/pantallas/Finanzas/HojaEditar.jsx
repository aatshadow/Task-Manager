import { useEffect, useRef, useState } from 'react'
import { Paperclip, Trash2, FileText } from 'lucide-react'
import Hoja from '../../componentes/Hoja.jsx'
import Campo from '../../componentes/Campo.jsx'
import Selector from '../../componentes/Selector.jsx'
import Boton from '../../componentes/Boton.jsx'
import { CLASES, RECURRENCIAS, AREAS } from '../../datos/finanzasCalculos.js'
import { subirDocumento, enlaceDocumento } from '../../datos/finanzas.js'

/**
 * Una hoja para editar cualquier fila de Finanzas. Cada tipo declara sus campos; la hoja los
 * pinta, convierte números y fechas y llama a `guardar(tabla, fila)`. Los movimientos que
 * vienen del banco sólo dejan tocar la capa de Alex (clase, categoría, negocio, nota…).
 */
const MONEDAS = ['EUR', 'USD', 'GBP', 'BGN'].map(m => ({ valor: m, etiqueta: m }))
const NEGOCIOS = ['CORE', 'EasyBiz', 'Izibizz', 'ScaleInfo', 'GrowthInfo', 'Black Phoenix', 'Personal'].map(n => ({ valor: n, etiqueta: n }))
const CATEGORIAS = ['Software', 'IA', 'Infraestructura', 'Publicidad', 'Equipo', 'Comisiones', 'Impuestos', 'Asesoría', 'Residencia', 'Viajes', 'Vivienda', 'Comida', 'Salud', 'Formación', 'Clientes', 'Sueldo', 'Inversión']

const SENTIDO = [{ valor: 'gasto', etiqueta: 'Gasto' }, { valor: 'ingreso', etiqueta: 'Ingreso' }]
const opciones = (lista) => lista.filter(x => x.valor !== '').map(x => ({ valor: x.valor, etiqueta: x.etiqueta }))

const TIPOS = {
  movimiento: {
    tabla: 'fin_movimientos', titulo: (f) => (f.id ? 'Movimiento' : 'Apuntar a mano'), documentos: 'movimientoId',
    campos: (f, d) => {
      const banco = f.origen === 'banco'
      return [
        !banco && { clave: '_sentido', etiqueta: 'Qué es', tipo: 'chips', opciones: SENTIDO },
        { clave: '_importe', etiqueta: 'Importe', tipo: 'numero', soloLectura: banco },
        !banco && { clave: 'moneda', etiqueta: 'Moneda', tipo: 'chips', opciones: MONEDAS },
        { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', soloLectura: banco },
        { clave: 'contraparte', etiqueta: 'A quién / de quién', tipo: 'texto' },
        { clave: 'descripcion', etiqueta: 'Concepto', tipo: 'texto' },
        { clave: 'clase', etiqueta: 'Clase', tipo: 'chips', opciones: CLASES },
        { clave: 'categoria', etiqueta: 'Categoría', tipo: 'texto', lista: 'fz-categorias' },
        { clave: 'negocio', etiqueta: 'Negocio', tipo: 'chips', opciones: NEGOCIOS, vacio: true },
        !banco && { clave: 'cuenta_id', etiqueta: 'Cuenta', tipo: 'desplegable', opciones: d.cuentas.map(c => ({ valor: c.id, etiqueta: c.nombre })), vacio: true },
        { clave: 'previsto_id', etiqueta: 'Cierra el previsto', tipo: 'desplegable', opciones: d.previstos.filter(p => p.estado === 'previsto' || p.id === f.previsto_id).map(p => ({ valor: p.id, etiqueta: p.titulo })), vacio: true },
        { clave: 'nota', etiqueta: 'Nota', tipo: 'area' },
      ]
    },
  },
  previsto: {
    tabla: 'fin_previstos', titulo: (f) => (f.id ? f.titulo : f.suscripcion ? 'Nueva suscripción' : f.tipo === 'ingreso' ? 'Ingreso previsto' : 'Gasto previsto'), documentos: 'previstoId',
    campos: () => [
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'chips', opciones: SENTIDO },
      { clave: 'titulo', etiqueta: 'Qué', tipo: 'texto' },
      { clave: 'importe', etiqueta: 'Importe (vacío si aún no lo sabes)', tipo: 'numero' },
      { clave: 'moneda', etiqueta: 'Moneda', tipo: 'chips', opciones: MONEDAS },
      { clave: 'fecha', etiqueta: 'Fecha (o la próxima, si se repite)', tipo: 'fecha' },
      { clave: 'recurrencia', etiqueta: 'Se repite (ninguno = una vez)', tipo: 'chips', opciones: RECURRENCIAS, vacio: true },
      { clave: 'clase', etiqueta: 'Clase', tipo: 'chips', opciones: CLASES },
      { clave: 'suscripcion', etiqueta: 'Es una suscripción', tipo: 'si' },
      { clave: 'provisionado', etiqueta: 'Ya apartado', tipo: 'numero' },
      { clave: 'categoria', etiqueta: 'Categoría', tipo: 'texto', lista: 'fz-categorias' },
      { clave: 'negocio', etiqueta: 'Negocio', tipo: 'chips', opciones: NEGOCIOS, vacio: true },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'chips', opciones: [{ valor: 'previsto', etiqueta: 'Previsto' }, { valor: 'pagado', etiqueta: 'Pagado' }, { valor: 'cancelado', etiqueta: 'Cancelado' }] },
      { clave: 'nota', etiqueta: 'Nota', tipo: 'area' },
    ],
  },
  objetivo: {
    tabla: 'fin_objetivos', titulo: (f) => f.titulo || 'Nuevo objetivo',
    campos: () => [
      { clave: 'titulo', etiqueta: 'Objetivo', tipo: 'texto' },
      { clave: 'importe', etiqueta: 'Importe (vacío en el colchón: sale solo)', tipo: 'numero' },
      { clave: 'moneda', etiqueta: 'Moneda', tipo: 'chips', opciones: MONEDAS },
      { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' },
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'chips', opciones: [{ valor: 'caja', etiqueta: 'Caja' }, { valor: 'colchon', etiqueta: 'Colchón' }, { valor: 'compra', etiqueta: 'Compra' }, { valor: 'inversion', etiqueta: 'Inversión' }] },
      { clave: 'principal', etiqueta: 'Es el objetivo principal (manda en la proyección)', tipo: 'si' },
      { clave: 'nota', etiqueta: 'Nota', tipo: 'area' },
    ],
  },
  cuenta: {
    tabla: 'fin_cuentas', titulo: (f) => f.nombre || 'Cuenta manual',
    campos: (f) => {
      const banco = f.banco && f.banco !== 'manual'
      return [
        { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
        { clave: 'tipo', etiqueta: 'Para qué es', tipo: 'chips', opciones: ['operativa', 'pocket', 'impuestos', 'colchon', 'ahorro', 'inversion'].map(v => ({ valor: v, etiqueta: v[0].toUpperCase() + v.slice(1) })) },
        { clave: 'saldo', etiqueta: banco ? 'Saldo (lo trae el banco)' : 'Saldo', tipo: 'numero', soloLectura: banco },
        !banco && { clave: 'moneda', etiqueta: 'Moneda', tipo: 'chips', opciones: MONEDAS },
        { clave: 'pct_reparto', etiqueta: '% del reparto que va aquí', tipo: 'numero' },
        { clave: 'activa', etiqueta: 'Cuenta en la liquidez', tipo: 'si' },
      ]
    },
  },
  accion: {
    tabla: 'fin_acciones', titulo: (f) => (f.id ? 'Acción del plan' : 'Nueva acción'),
    campos: () => [
      { clave: 'titulo', etiqueta: 'Qué hay que hacer', tipo: 'texto' },
      { clave: 'detalle', etiqueta: 'Detalle', tipo: 'area' },
      { clave: 'area', etiqueta: 'Área', tipo: 'chips', opciones: AREAS },
      { clave: 'prioridad', etiqueta: 'Prioridad', tipo: 'chips', opciones: [{ valor: 1, etiqueta: 'Alta' }, { valor: 2, etiqueta: 'Media' }, { valor: 3, etiqueta: 'Baja' }] },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'chips', opciones: [{ valor: 'pendiente', etiqueta: 'Pendiente' }, { valor: 'en_curso', etiqueta: 'En curso' }, { valor: 'hecha', etiqueta: 'Hecha' }] },
      { clave: 'fecha', etiqueta: 'Para cuándo', tipo: 'fecha' },
      { clave: 'importe_estimado', etiqueta: 'Coste estimado (€)', tipo: 'numero' },
    ],
  },
  ajustes: {
    tabla: 'fin_ajustes', titulo: () => 'Reglas del dinero', sinBorrar: true,
    campos: () => [
      { clave: 'sueldo_dueno', etiqueta: 'Sueldo del dueño (€/mes)', tipo: 'numero' },
      { clave: 'colchon_meses', etiqueta: 'Colchón (meses de gasto fijo)', tipo: 'numero' },
      { clave: 'impuestos_pct', etiqueta: '% de cada ingreso para impuestos', tipo: 'numero' },
    ],
  },
}

const NUMERICOS = ['importe', 'provisionado', 'saldo', 'pct_reparto', 'importe_estimado', 'sueldo_dueno', 'colchon_meses', 'impuestos_pct']

function inicial(tipo, fila) {
  const f = { ...fila }
  if (tipo === 'movimiento') {
    f._sentido = Number(f.importe) > 0 ? 'ingreso' : 'gasto'
    f._importe = f.importe != null ? String(Math.abs(f.importe)) : ''
  }
  if (tipo === 'previsto') Object.assign(f, { tipo: f.tipo || 'gasto', moneda: f.moneda || 'EUR', clase: f.clase || 'obligatorio', estado: f.estado || 'previsto', recurrencia: f.recurrencia || '' })
  if (tipo === 'cuenta') Object.assign(f, { tipo: f.tipo || 'operativa', moneda: f.moneda || 'EUR', activa: f.activa ?? true })
  if (tipo === 'objetivo') Object.assign(f, { tipo: f.tipo || 'caja', moneda: f.moneda || 'EUR' })
  if (tipo === 'accion') Object.assign(f, { estado: f.estado || 'pendiente' })
  for (const k of NUMERICOS) if (f[k] != null) f[k] = String(f[k])
  return f
}

function aFila(tipo, f) {
  const fila = { ...f }
  for (const k of NUMERICOS) if (k in fila) fila[k] = fila[k] === '' || fila[k] == null ? null : Number(String(fila[k]).replace(',', '.'))
  if (tipo === 'movimiento') {
    const n = Math.abs(Number(String(f._importe).replace(',', '.')) || 0)
    if (f.origen !== 'banco') fila.importe = f._sentido === 'ingreso' ? n : -n
    if (f.origen !== 'banco' && !fila.clase) fila.clase = f._sentido === 'ingreso' ? 'ingreso' : 'libre'
  }
  if (tipo === 'previsto') {
    fila.recurrencia = fila.recurrencia || null
    if (fila.provisionado == null) fila.provisionado = 0
  }
  for (const k of Object.keys(fila)) if (fila[k] === '') fila[k] = null
  return fila
}

export default function HojaEditar({ editando, d, alCerrar, guardar, borrar, avisar, recargar }) {
  const [f, setF] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const fichero = useRef(null)
  const tipo = editando?.tipo
  const def = tipo ? TIPOS[tipo] : null

  useEffect(() => { if (editando) setF(inicial(editando.tipo, editando.fila)) }, [editando])

  if (!def) return <Hoja abierta={false} alCerrar={alCerrar} />
  const poner = (k) => (v) => setF(prev => ({ ...prev, [k]: v }))
  const campos = def.campos(f, d).filter(Boolean)
  const docs = def.documentos && f.id ? d.documentos.filter(x => (tipo === 'movimiento' ? x.movimiento_id : x.previsto_id) === f.id) : []

  const alGuardar = async () => {
    if (campos.some(c => c.clave === 'titulo') && !String(f.titulo || '').trim()) return avisar('Ponle un título', 'error')
    if (tipo === 'cuenta' && !String(f.nombre || '').trim()) return avisar('Ponle un nombre', 'error')
    setGuardando(true)
    const okk = await guardar(def.tabla, aFila(tipo, f))
    setGuardando(false)
    if (okk) alCerrar()
  }
  const alBorrar = async () => { if (await borrar(def.tabla, f.id)) alCerrar() }

  const alSubir = async (e) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setSubiendo(true)
    try { await subirDocumento(archivo, { [def.documentos]: f.id }); avisar('Factura archivada'); await recargar() } catch (err) { avisar(err.message, 'error') } finally { setSubiendo(false) }
  }
  const abrirDoc = async (doc) => {
    try { window.open(await enlaceDocumento(doc.id), '_blank', 'noopener') } catch (err) { avisar(err.message, 'error') }
  }

  const banco = tipo === 'movimiento' && f.origen === 'banco'
  const pie = (
    <>
      {f.id && !def.sinBorrar && !banco && <Boton variante="peligro" icono={<Trash2 size={18} />} aria-label="Borrar" onClick={alBorrar} />}
      <Boton variante="primario" cargando={guardando} onClick={alGuardar}>Guardar</Boton>
    </>
  )

  return (
    <Hoja abierta={!!editando} alCerrar={alCerrar} titulo={def.titulo(f)} pie={pie}>
      <datalist id="fz-categorias">{CATEGORIAS.map(c => <option key={c} value={c} />)}</datalist>
      <div className="columna fz-formulario">
        {banco && <div className="t-terciario">Viene de {d.cuentas.find(c => c.id === f.cuenta_id)?.nombre || 'el banco'}: el importe y la fecha los manda el banco.</div>}
        {campos.map(c => {
          if (c.tipo === 'chips') {
            return <Selector key={c.clave} etiqueta={c.etiqueta} opciones={opciones(c.opciones)} valor={f[c.clave] ?? ''} permitirVacio={c.vacio} alCambiar={poner(c.clave)} />
          }
          if (c.tipo === 'desplegable') {
            return <Selector key={c.clave} modo="desplegable" etiqueta={c.etiqueta} opciones={c.opciones} valor={f[c.clave] ?? ''} permitirVacio placeholder="Ninguno" alCambiar={poner(c.clave)} />
          }
          if (c.tipo === 'si') {
            return (
              <label key={c.clave} className="fz-si">
                <input type="checkbox" checked={!!f[c.clave]} onChange={e => poner(c.clave)(e.target.checked)} />
                <span>{c.etiqueta}</span>
              </label>
            )
          }
          return (
            <Campo
              key={c.clave}
              etiqueta={c.etiqueta}
              valor={f[c.clave] ?? ''}
              alCambiar={c.soloLectura ? undefined : poner(c.clave)}
              readOnly={c.soloLectura}
              multilinea={c.tipo === 'area'}
              type={c.tipo === 'fecha' ? 'date' : 'text'}
              inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
              list={c.lista}
            />
          )
        })}

        {def.documentos && f.id && (
          <div className="fz-docs">
            <div className="campo-etiqueta">Facturas y justificantes</div>
            {docs.map(doc => (
              <div key={doc.id} className="fz-doc">
                <button type="button" className="fz-doc-abrir" onClick={() => abrirDoc(doc)}><FileText size={16} /> {doc.nombre}</button>
                <Boton variante="fantasma" pequeno icono={<Trash2 size={14} />} aria-label="Quitar" onClick={() => borrar('fin_documentos', doc.id)} />
              </div>
            ))}
            <input ref={fichero} type="file" accept="application/pdf,image/*" hidden onChange={alSubir} />
            <Boton variante="secundario" pequeno cargando={subiendo} icono={<Paperclip size={15} />} onClick={() => fichero.current?.click()}>Adjuntar factura</Boton>
          </div>
        )}
        {def.documentos && !f.id && <div className="t-terciario">Guárdalo primero para adjuntar la factura.</div>}
      </div>
    </Hoja>
  )
}

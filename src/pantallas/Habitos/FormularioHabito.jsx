import { useEffect, useState } from 'react'
import { Archive, Minus, Plus } from 'lucide-react'
import Hoja from '../../componentes/Hoja.jsx'
import Campo from '../../componentes/Campo.jsx'
import Boton from '../../componentes/Boton.jsx'
import Segmentos from '../../componentes/Segmentos.jsx'
import Selector from '../../componentes/Selector.jsx'
import { crearHabito, actualizarHabito, archivarHabito, TIPOS, GRUPOS } from '../../datos/habitos.js'
import { useDatos } from '../../estado/useDatos.jsx'
import { LETRAS_DIA } from './RejillaHabito.jsx'

// Los 8 colores que ya viven en la base (cuadrantes, categorías y etapas sembradas): un
// hábito no estrena color, elige uno de los que la app ya pinta.
export const PALETA = ['#ff6a1a', '#e8b13a', '#3fb950', '#38bdf8', '#4c8dff', '#a56bff', '#e8629a', '#d7263d']

// Atajos de emoji para no abrir el teclado de símbolos en el móvil; el campo admite cualquiera.
const EMOJIS = ['💪', '📖', '🧘', '💧', '🏃', '🛏️', '✍️', '🥗']

const CADENCIAS = [
  { valor: 'diario', etiqueta: 'Diario' },
  { valor: 'dias', etiqueta: 'Días' },
  { valor: 'semana', etiqueta: 'Por semana' },
]

/**
 * Un icono es UN grafema: «Leer» o dos emojis desbordan el círculo de 40px. Intl.Segmenter
 * respeta los emojis compuestos (banderas, tonos de piel, 🛏️ con su selector); si el
 * navegador no lo trae, Array.from al menos no parte un emoji por la mitad.
 */
function primerGrafema(texto) {
  const t = texto.trim()
  if (!t) return ''
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const [primero] = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)
    return primero?.segment || ''
  }
  return Array.from(t).slice(0, 1).join('')
}

const TIPOS_SEG = TIPOS.map((t) => ({ valor: t.clave, etiqueta: t.nombre }))
const SIN_GRUPO = '—'

const VACIO = {
  nombre: '', icono: '', color: PALETA[0], cadencia: 'diario', dias: [1, 2, 3, 4, 5], vecesSemana: 3,
  hora: '', grupo: '', tipo: 'hacer', unidad: '', objetivo: '', bloqueId: '', descripcion: '', plan: {},
}

/**
 * Alta y edición de un hábito, en una hoja. El mismo formulario para las dos cosas:
 * `habito` null = nuevo. Guarda con `crearHabito`/`actualizarHabito` y avisa por
 * `alGuardado(habito)`; archivar pide confirmación inline (nada de window.confirm) y
 * avisa por `alArchivado(habito)`. Quien la monta decide qué recargar.
 */
export default function FormularioHabito({ abierta, habito, alCerrar, alGuardado, alArchivado, avisar }) {
  const editando = Boolean(habito)
  const { bloques } = useDatos()
  const [form, setForm] = useState(VACIO)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  // Al abrir se parte del hábito (o del vacío); al cerrar no se toca para que la
  // animación de salida no enseñe un formulario en blanco.
  useEffect(() => {
    if (!abierta) return
    setForm(habito ? {
      nombre: habito.nombre, icono: habito.icono || '', color: habito.color || PALETA[0],
      cadencia: habito.cadencia || 'diario', dias: habito.dias?.length ? habito.dias : VACIO.dias,
      vecesSemana: habito.vecesSemana || VACIO.vecesSemana,
      hora: habito.hora || '', grupo: habito.grupo || '', tipo: habito.tipo || 'hacer',
      unidad: habito.unidad || '', objetivo: habito.objetivo == null ? '' : String(habito.objetivo),
      bloqueId: habito.bloqueId || '', descripcion: habito.descripcion || '',
      plan: habito.plan && typeof habito.plan === 'object' ? habito.plan : {},
    } : VACIO)
    setError(''); setConfirmar(false); setOcupado(false)
  }, [abierta, habito])

  const poner = (parche) => setForm((f) => ({ ...f, ...parche }))
  const alternarDia = (d) => poner({ dias: form.dias.includes(d) ? form.dias.filter((x) => x !== d) : [...form.dias, d].sort() })
  const veces = (n) => poner({ vecesSemana: Math.min(7, Math.max(1, n)) })

  const guardar = async () => {
    const nombre = form.nombre.trim()
    if (!nombre) { setError('Ponle un nombre'); return }
    if (form.cadencia === 'dias' && !form.dias.length) { setError('Elige al menos un día'); return }
    setError(''); setOcupado(true)
    try {
      const datos = {
        nombre, icono: primerGrafema(form.icono), color: form.color, cadencia: form.cadencia, dias: form.dias, vecesSemana: form.vecesSemana,
        hora: form.hora || null, grupo: form.grupo.trim(), tipo: form.tipo,
        unidad: form.tipo === 'medir' ? form.unidad.trim() : '',
        objetivo: form.tipo === 'medir' && form.objetivo !== '' ? Number(String(form.objetivo).replace(',', '.')) : null,
        bloqueId: form.bloqueId || null, descripcion: form.descripcion.trim(), plan: form.plan,
      }
      const h = editando ? await actualizarHabito(habito.id, datos) : await crearHabito(datos)
      await alGuardado?.(h)
    } catch (e) {
      avisar?.(e.message || 'No se pudo guardar', 'error')
    } finally {
      setOcupado(false)
    }
  }

  const archivar = async () => {
    setOcupado(true)
    try {
      const h = await archivarHabito(habito.id, true)
      await alArchivado?.(h)
    } catch (e) {
      avisar?.(e.message || 'No se pudo archivar', 'error')
    } finally {
      setOcupado(false)
    }
  }

  // Enter en el nombre guarda. No hay <form>: Segmentos pinta botones sin type y un
  // toque en «Días» se convertiría en un submit.
  const alTeclear = (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar() } }

  return (
    <Hoja
      abierta={abierta}
      alCerrar={alCerrar}
      titulo={editando ? 'Editar hábito' : 'Nuevo hábito'}
      pie={(
        <>
          <Boton variante="secundario" onClick={alCerrar} disabled={ocupado}>Cancelar</Boton>
          <Boton onClick={guardar} cargando={ocupado}>{editando ? 'Guardar' : 'Crear'}</Boton>
        </>
      )}
    >
      <div className="habito-form">
        <Campo
          etiqueta="Nombre"
          valor={form.nombre}
          alCambiar={(v) => { poner({ nombre: v }); if (error) setError('') }}
          placeholder="Leer 20 minutos"
          autoFocus={!editando}
          error={error && !form.nombre.trim() ? error : undefined}
          enterKeyHint="done"
          onKeyDown={alTeclear}
        />

        <div className="columna" style={{ gap: 8 }}>
          <Campo etiqueta="Icono" valor={form.icono} alCambiar={(v) => poner({ icono: primerGrafema(v) })} placeholder="Un emoji" inputMode="text" />
          <div className="habito-form-emojis" aria-label="Emojis sugeridos">
            {EMOJIS.map((e) => (
              <button key={e} type="button" className="habito-form-emoji" aria-pressed={form.icono === e} onClick={() => poner({ icono: form.icono === e ? '' : e })}>{e}</button>
            ))}
          </div>
        </div>

        <div className="columna" style={{ gap: 8 }}>
          <div className="campo-etiqueta">Color</div>
          <div className="habito-form-colores" role="radiogroup" aria-label="Color">
            {PALETA.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={form.color === c}
                aria-label={`Color ${c}`}
                className="habito-form-color"
                style={{ '--color': c }}
                onClick={() => poner({ color: c })}
              />
            ))}
          </div>
        </div>

        <div className="columna" style={{ gap: 10 }}>
          <div className="campo-etiqueta">Cadencia</div>
          <Segmentos opciones={CADENCIAS} valor={form.cadencia} alCambiar={(v) => { poner({ cadencia: v }); setError('') }} />
          {form.cadencia === 'dias' && (
            <div className="habito-form-dias" role="group" aria-label="Días de la semana">
              {LETRAS_DIA.map((l, i) => {
                const d = i + 1
                return (
                  <button key={d} type="button" className="habito-form-dia" aria-pressed={form.dias.includes(d)} onClick={() => alternarDia(d)}>{l}</button>
                )
              })}
            </div>
          )}
          {form.cadencia === 'semana' && (
            <div className="habito-form-stepper">
              <Boton variante="secundario" pequeno icono={<Minus size={18} strokeWidth={1.75} />} aria-label="Una vez menos" onClick={() => veces(form.vecesSemana - 1)} disabled={form.vecesSemana <= 1} />
              <span className="habito-form-stepper-valor" aria-live="polite">{form.vecesSemana}</span>
              <Boton variante="secundario" pequeno icono={<Plus size={18} strokeWidth={1.75} />} aria-label="Una vez más" onClick={() => veces(form.vecesSemana + 1)} disabled={form.vecesSemana >= 7} />
              <span className="habito-form-stepper-texto">{form.vecesSemana === 1 ? 'vez por semana' : 'veces por semana'}, el día da igual</span>
            </div>
          )}
          {error && form.nombre.trim() && <div className="campo-ayuda" style={{ color: 'var(--peligro)' }}>{error}</div>}
        </div>

        <div className="rejilla-2">
          <Campo etiqueta="Hora" type="time" valor={form.hora} alCambiar={(v) => poner({ hora: v })} ayuda="A qué hora toca" />
          <Selector
            etiqueta="Grupo"
            valor={GRUPOS.includes(form.grupo) ? form.grupo : (form.grupo ? 'otro' : SIN_GRUPO)}
            alCambiar={(v) => poner({ grupo: v === SIN_GRUPO ? '' : v === 'otro' ? (GRUPOS.includes(form.grupo) ? '' : form.grupo) : v })}
            modo="desplegable"
            opciones={[{ valor: SIN_GRUPO, etiqueta: 'Sin grupo' }, ...GRUPOS.map((g) => ({ valor: g, etiqueta: g })), { valor: 'otro', etiqueta: 'Otro…' }]}
          />
        </div>
        {!GRUPOS.includes(form.grupo) && form.grupo !== '' && (
          <Campo etiqueta="Nombre del grupo" valor={form.grupo} alCambiar={(v) => poner({ grupo: v })} placeholder="Calibración" />
        )}

        <div className="columna" style={{ gap: 10 }}>
          <div className="campo-etiqueta">Tipo</div>
          <Segmentos opciones={TIPOS_SEG} valor={form.tipo} alCambiar={(v) => poner({ tipo: v })} />
          <div className="campo-ayuda">
            {form.tipo === 'hacer' && 'Marcar es haberlo hecho.'}
            {form.tipo === 'evitar' && 'Marcar es haber resistido: cuenta igual que un «hacer».'}
            {form.tipo === 'medir' && 'Se cumple escribiendo el número del día (peso, horas…).'}
          </div>
          {form.tipo === 'medir' && (
            <div className="rejilla-2">
              <Campo etiqueta="Unidad" valor={form.unidad} alCambiar={(v) => poner({ unidad: v })} placeholder="kg" />
              <Campo etiqueta="Objetivo" inputMode="decimal" valor={form.objetivo} alCambiar={(v) => poner({ objetivo: v })} placeholder="6,5" ayuda="Línea punteada" />
            </div>
          )}
        </div>

        <Selector
          etiqueta="Bloque del día"
          valor={form.bloqueId || SIN_GRUPO}
          alCambiar={(v) => poner({ bloqueId: v === SIN_GRUPO ? '' : v })}
          modo="desplegable"
          opciones={[{ valor: SIN_GRUPO, etiqueta: 'Sin bloque' }, ...(bloques || []).map((b) => ({ valor: b.id, etiqueta: `${b.inicio} · ${b.nombre}` }))]}
        />

        <Campo etiqueta="Descripción" valor={form.descripcion} alCambiar={(v) => poner({ descripcion: v })} placeholder="Lo que hay que hacer, en una línea" multilinea rows={2} />

        <EditorPlan plan={form.plan} alCambiar={(plan) => poner({ plan })} />

        {editando && (
          <div className="habito-form-pie">
            {confirmar ? (
              <div className="habito-form-confirmar" role="alertdialog" aria-label="Confirmar archivado">
                <span>¿Archivar «{habito.nombre}»? Sus marcas se conservan y podrás verlo al final de la lista.</span>
                <div className="fila">
                  <Boton variante="fantasma" pequeno onClick={() => setConfirmar(false)} disabled={ocupado}>No</Boton>
                  <Boton variante="primario" pequeno className="boton--borrar" onClick={archivar} cargando={ocupado}>Archivar</Boton>
                </div>
              </div>
            ) : (
              <Boton variante="peligro" pequeno icono={<Archive size={18} strokeWidth={1.75} />} onClick={() => setConfirmar(true)} disabled={ocupado}>Archivar hábito</Boton>
            )}
          </div>
        )}
      </div>
    </Hoja>
  )
}

/**
 * El editor del plan por día (LOGICA §10.3): siete pestañas L–D, cada una con un título y
 * las líneas de la sesión (una por renglón). Es lo que enseña Hoy al desplegar el hábito
 * (Entreno). Un día sin título ni líneas se borra del plan: un plan vacío es `{}`.
 */
function EditorPlan({ plan, alCambiar }) {
  const [dia, setDia] = useState(1)
  const actual = plan?.[String(dia)] || { titulo: '', lineas: [] }
  const tiene = (d) => { const p = plan?.[String(d)]; return !!(p && (p.titulo || (p.lineas || []).length)) }

  const poner = (parche) => {
    const nuevo = { ...(plan || {}) }
    const fusion = { titulo: actual.titulo || '', lineas: actual.lineas || [], ...parche }
    if (!fusion.titulo && !fusion.lineas.length) delete nuevo[String(dia)]
    else nuevo[String(dia)] = fusion
    alCambiar(nuevo)
  }

  return (
    <div className="columna" style={{ gap: 10 }}>
      <div className="campo-etiqueta">Plan por día <span className="t-terciario">(opcional)</span></div>
      <div className="habito-form-dias" role="tablist" aria-label="Día del plan">
        {LETRAS_DIA.map((l, i) => {
          const d = i + 1
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={dia === d}
              className={`habito-form-dia${dia === d ? ' habito-form-dia--activo' : ''}${tiene(d) ? ' habito-form-dia--lleno' : ''}`}
              onClick={() => setDia(d)}
            >
              {l}
            </button>
          )
        })}
      </div>
      <Campo etiqueta="Título de la sesión" valor={actual.titulo || ''} alCambiar={(v) => poner({ titulo: v })} placeholder="Leopardo — explosividad" />
      <Campo
        etiqueta="Líneas"
        valor={(actual.lineas || []).join('\n')}
        alCambiar={(v) => poner({ lineas: v.split('\n').map((x) => x.trim()).filter(Boolean) })}
        placeholder={'Calentamiento 5\'\n4 rondas: saco 3\' · burpees 12'}
        multilinea
        rows={4}
        ayuda="Una línea por ejercicio o paso"
      />
    </div>
  )
}

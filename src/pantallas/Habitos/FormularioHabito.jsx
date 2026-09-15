import { useEffect, useState } from 'react'
import { Archive, Minus, Plus } from 'lucide-react'
import Hoja from '../../componentes/Hoja.jsx'
import Campo from '../../componentes/Campo.jsx'
import Boton from '../../componentes/Boton.jsx'
import Segmentos from '../../componentes/Segmentos.jsx'
import { crearHabito, actualizarHabito, archivarHabito } from '../../datos/habitos.js'
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

const VACIO = { nombre: '', icono: '', color: PALETA[0], cadencia: 'diario', dias: [1, 2, 3, 4, 5], vecesSemana: 3 }

/**
 * Alta y edición de un hábito, en una hoja. El mismo formulario para las dos cosas:
 * `habito` null = nuevo. Guarda con `crearHabito`/`actualizarHabito` y avisa por
 * `alGuardado(habito)`; archivar pide confirmación inline (nada de window.confirm) y
 * avisa por `alArchivado(habito)`. Quien la monta decide qué recargar.
 */
export default function FormularioHabito({ abierta, habito, alCerrar, alGuardado, alArchivado, avisar }) {
  const editando = Boolean(habito)
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
      const datos = { nombre, icono: primerGrafema(form.icono), color: form.color, cadencia: form.cadencia, dias: form.dias, vecesSemana: form.vecesSemana }
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

import { useState } from 'react'
import { Clock, Flame, Inbox, Search, Sparkles, Sun, Trash2 } from 'lucide-react'
import Tarjeta from '../componentes/Tarjeta.jsx'
import NumeroGrande from '../componentes/NumeroGrande.jsx'
import Chip from '../componentes/Chip.jsx'
import Boton from '../componentes/Boton.jsx'
import Campo from '../componentes/Campo.jsx'
import Selector from '../componentes/Selector.jsx'
import Hoja from '../componentes/Hoja.jsx'
import Nav from '../componentes/Nav.jsx'
import Cabecera from '../componentes/Cabecera.jsx'
import Marca from '../componentes/Marca.jsx'
import Vacio from '../componentes/Vacio.jsx'
import FAB from '../componentes/FAB.jsx'
import Segmentos from '../componentes/Segmentos.jsx'
import Pestanas from '../componentes/Pestanas.jsx'

// Solo desarrollo: se abre con #muestrario y enseña cada componente con datos falsos.
// No importa nada de src/datos: aquí no hay Supabase.

const CUADRANTES = [
  { valor: 'q1', etiqueta: 'Urgente e importante', color: '#d7263d' },
  { valor: 'q2', etiqueta: 'Importante', color: '#ff6a1a' },
  { valor: 'q3', etiqueta: 'Urgente', color: '#e8b13a' },
  { valor: 'q4', etiqueta: 'Ni ni', color: '#8a8f98' },
]
const PROYECTOS = [
  { valor: 'p1', etiqueta: '2day' },
  { valor: 'p2', etiqueta: 'SYSTEMA' },
  { valor: 'c1', etiqueta: 'kiki (cliente)' },
]

function Bloque({ titulo, children }) {
  return (
    <section className="muestrario-bloque">
      <h3>{titulo}</h3>
      {children}
    </section>
  )
}

function FilaTarea({ titulo, hora, chip, color }) {
  const [hecha, setHecha] = useState(false)
  return (
    <Tarjeta compacta>
      <div className="fila">
        <Marca hecha={hecha} alCambiar={setHecha} />
        <div className="espacio" style={{ minWidth: 0 }}>
          <div style={{ textDecoration: hecha ? 'line-through' : 'none', color: hecha ? 'var(--texto-3)' : 'var(--texto)' }}>{titulo}</div>
          <div className="t-terciario">{hora}</div>
        </div>
        <Chip color={color} pequeno>{chip}</Chip>
      </div>
    </Tarjeta>
  )
}

export default function Muestrario() {
  const [pestanaNav, setPestanaNav] = useState('hoy')
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [segmento, setSegmento] = useState('semana')
  const [pestana, setPestana] = useState('siguiente')
  const [cuadrante, setCuadrante] = useState('q2')
  const [proyecto, setProyecto] = useState(null)
  const [texto, setTexto] = useState('')
  const [nota, setNota] = useState('')
  const [filtro, setFiltro] = useState('todo')
  const [marcaGrande, setMarcaGrande] = useState(true)

  return (
    <div className="app">
      <Cabecera titulo="Muestrario" subtitulo="Todos los componentes, con datos falsos" alAvatar={() => alert('avatar → Ajustes')} />
      <div className="pantalla">

        <Bloque titulo="Tarjeta · calida (la destacada de Hoy)">
          <Tarjeta variante="calida">
            <div className="t-secundario">Siguiente · 10:30</div>
            <div className="t-titulo" style={{ marginTop: 8 }}>Cerrar el módulo de finanzas</div>
            <div className="fila" style={{ marginTop: 16 }}>
              <Chip color="#ff6a1a" pequeno>Importante</Chip>
              <Chip color="#5b8def" pequeno>SYSTEMA</Chip>
            </div>
          </Tarjeta>
        </Bloque>

        <Bloque titulo="Tarjeta · naranja (lo activo / ahora) y normal">
          <div className="columna">
            <Tarjeta variante="naranja" onClick={() => alert('activa')}>
              <div className="t-secundario">Ahora · 09:00 – 10:00</div>
              <div className="t-titulo" style={{ marginTop: 6 }}>Revisión de la semana</div>
            </Tarjeta>
            <Tarjeta>
              <div className="t-titulo">Tarjeta normal</div>
              <div className="t-secundario" style={{ marginTop: 4 }}>#1f1f1f, 24px de radio, sin sombra</div>
              <Tarjeta elevada compacta style={{ marginTop: 12 }}>
                <div className="t-secundario">Elevada dentro: #262626</div>
              </Tarjeta>
            </Tarjeta>
          </div>
        </Bloque>

        <Bloque titulo="NumeroGrande · los cuatro de Hoy">
          <div className="rejilla-2">
            <NumeroGrande valor={4} etiqueta="Hechas hoy" icono={<Sun size={18} strokeWidth={1.75} />} />
            <NumeroGrande valor={7} etiqueta="En Hoy" variante="naranja" icono={<Flame size={18} strokeWidth={1.75} />} />
            <NumeroGrande valor={2} etiqueta="Atrasadas" icono={<Clock size={18} strokeWidth={1.75} />} />
            <NumeroGrande valor={12} etiqueta="Bandeja" icono={<Inbox size={18} strokeWidth={1.75} />} />
          </div>
          <div style={{ marginTop: 12 }}>
            <NumeroGrande valor={86} sufijo="%" etiqueta="Cumplimiento de la semana" variante="calida" />
          </div>
        </Bloque>

        <Bloque titulo="Chip · colores del dato; pulsables como filtro">
          <div className="muestrario-fila">
            <Chip color="#d7263d">Urgente e importante</Chip>
            <Chip color="#ff6a1a">Importante</Chip>
            <Chip color="#e8b13a">Urgente</Chip>
            <Chip color="#8a8f98">Ni ni</Chip>
            <Chip color="#5b8def" pequeno>SYSTEMA</Chip>
            <Chip color="#3ec27a" pequeno>ventas</Chip>
            <Chip color="#ff6a1a" solido punto={false}>hecha</Chip>
          </div>
          <div className="muestrario-fila" style={{ marginTop: 10 }}>
            {['todo', 'proyecto', 'cuadrante'].map(f => (
              <Chip key={f} color="#ff6a1a" activo={filtro === f} onClick={() => setFiltro(f)}>{f}</Chip>
            ))}
          </div>
        </Bloque>

        <Bloque titulo="Boton">
          <div className="muestrario-fila">
            <Boton>Entrar</Boton>
            <Boton variante="secundario">Cancelar</Boton>
            <Boton variante="fantasma">Ver todo</Boton>
            <Boton variante="peligro" icono={<Trash2 size={16} strokeWidth={1.75} />}>Borrar</Boton>
          </div>
          <div className="muestrario-fila" style={{ marginTop: 10 }}>
            <Boton icono={<Search size={20} strokeWidth={1.75} />} aria-label="Buscar" variante="secundario" />
            <Boton icono={<Sparkles size={20} strokeWidth={1.75} />} aria-label="Sugerir" variante="primario" />
            <Boton icono={<Trash2 size={20} strokeWidth={1.75} />} aria-label="Borrar" variante="fantasma" />
            <Boton pequeno>Pequeño</Boton>
            <Boton pequeno variante="secundario" cargando>Cargando</Boton>
            <Boton disabled>Bloqueado</Boton>
          </div>
          <div style={{ marginTop: 10 }}><Boton completo>Ancho completo</Boton></div>
        </Bloque>

        <Bloque titulo="Campo">
          <div className="columna">
            <Campo etiqueta="Título" placeholder="Qué hay que hacer" valor={texto} alCambiar={setTexto} />
            <Campo etiqueta="Con icono" placeholder="Buscar…" icono={<Search size={18} strokeWidth={1.75} />} />
            <Campo etiqueta="Vence" type="date" />
            <Campo etiqueta="Email" type="email" valor="alex@growthinfo" error="Ese correo no parece completo" readOnly />
            <Campo etiqueta="Notas" multilinea placeholder="Solo tú las ves" valor={nota} alCambiar={setNota} ayuda="Privadas: nadie del portal las lee." />
          </div>
        </Bloque>

        <Bloque titulo="Selector · chips y desplegable">
          <div className="columna" style={{ gap: 16 }}>
            <Selector etiqueta="Cuadrante" opciones={CUADRANTES} valor={cuadrante} alCambiar={setCuadrante} permitirVacio />
            <Selector etiqueta="Proyecto" modo="desplegable" opciones={PROYECTOS} valor={proyecto} alCambiar={setProyecto} placeholder="Sin proyecto" permitirVacio />
          </div>
        </Bloque>

        <Bloque titulo="Segmentos">
          <div className="columna">
            <Segmentos opciones={[{ valor: 'dia', etiqueta: 'Día' }, { valor: 'semana', etiqueta: 'Semana' }, { valor: 'mes', etiqueta: 'Mes' }]} valor={segmento} alCambiar={setSegmento} />
            <Segmentos naranja opciones={[{ valor: '7', etiqueta: '7 días' }, { valor: '30', etiqueta: '30 días' }, { valor: '90', etiqueta: '90 días' }]} valor="30" alCambiar={() => {}} />
          </div>
        </Bloque>

        <Bloque titulo="Pestanas · con scroll">
          <Pestanas
            opciones={[
              { valor: 'bandeja', etiqueta: 'Bandeja', cuenta: 12 },
              { valor: 'siguiente', etiqueta: 'Siguiente', cuenta: 31 },
              { valor: 'tableros', etiqueta: 'Tableros' },
              { valor: 'explorar', etiqueta: 'Explorar GrowthInfo' },
              { valor: 'nevera', etiqueta: 'Nevera', cuenta: 3 },
            ]}
            valor={pestana}
            alCambiar={setPestana}
          />
        </Bloque>

        <Bloque titulo="Marca · el círculo de completar, en filas">
          <div className="columna">
            <FilaTarea titulo="Llamar a Víctor por los afiliados" hora="11:00 – 11:30" chip="ventas" color="#3ec27a" />
            <FilaTarea titulo="Escribir el informe de la noche" hora="Todo el día" chip="q2" color="#ff6a1a" />
            <div className="fila" style={{ marginTop: 6 }}>
              <Marca grande hecha={marcaGrande} alCambiar={setMarcaGrande} />
              <div className="t-secundario">Grande, para los hábitos de hoy</div>
            </div>
          </div>
        </Bloque>

        <Bloque titulo="Hoja · bottom sheet">
          <Boton variante="secundario" onClick={() => setHojaAbierta(true)}>Abrir hoja</Boton>
          <Hoja
            abierta={hojaAbierta}
            alCerrar={() => setHojaAbierta(false)}
            titulo="Cerrar el módulo de finanzas"
            pie={<>
              <Boton variante="secundario" onClick={() => setHojaAbierta(false)}>Cerrar</Boton>
              <Boton onClick={() => setHojaAbierta(false)}>Guardar</Boton>
            </>}
          >
            <div className="columna" style={{ gap: 16 }}>
              <Selector etiqueta="Cuadrante" opciones={CUADRANTES} valor={cuadrante} alCambiar={setCuadrante} />
              <Selector etiqueta="Proyecto" modo="desplegable" opciones={PROYECTOS} valor={proyecto} alCambiar={setProyecto} permitirVacio placeholder="Sin proyecto" />
              <Campo etiqueta="Vence" type="date" />
              <Campo etiqueta="Notas" multilinea placeholder="Solo tú las ves" valor={nota} alCambiar={setNota} />
              {Array.from({ length: 8 }, (_, i) => (
                <Tarjeta key={i} compacta><div className="t-secundario">Relleno {i + 1} para probar el scroll interno</div></Tarjeta>
              ))}
            </div>
          </Hoja>
        </Bloque>

        <Bloque titulo="Vacio">
          <Tarjeta>
            <Vacio titulo="Nada en la bandeja" texto="Lo que captures con el + aparece aquí sin clasificar." accion={<Boton pequeno variante="secundario">Capturar</Boton>} />
          </Tarjeta>
        </Bloque>

        <Bloque titulo="Nav y FAB · abajo, fijos">
          <div className="t-secundario">Pestaña activa: <b style={{ color: 'var(--acento)' }}>{pestanaNav}</b>. Toca el + para probar la respuesta.</div>
        </Bloque>
      </div>

      <FAB alPulsar={() => alert('captura rápida')} />
      <Nav activa={pestanaNav} alCambiar={setPestanaNav} />
    </div>
  )
}

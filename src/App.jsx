import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import './estilos/ensamblaje.css'
import Cabecera from './componentes/Cabecera.jsx'
import Nav from './componentes/Nav.jsx'
import FAB from './componentes/FAB.jsx'
import Aviso from './componentes/Aviso.jsx'
import DetalleTarea from './componentes/DetalleTarea.jsx'
import NuevaTarea from './componentes/NuevaTarea.jsx'
import Hoy from './pantallas/Hoy/Hoy.jsx'
import Tareas from './pantallas/Tareas/Tareas.jsx'
import Calendario from './pantallas/Calendario/Calendario.jsx'
import Habitos from './pantallas/Habitos/Habitos.jsx'
import Estadisticas from './pantallas/Estadisticas/Estadisticas.jsx'
import Ajustes from './pantallas/Ajustes/Ajustes.jsx'
import Acceso from './pantallas/Acceso/Acceso.jsx'
import Muestrario from './dev/Muestrario.jsx'
import { ProveedorDatos, useDatos } from './estado/useDatos.jsx'
import { resumenHoy } from './datos/estadisticas.js'

// Qué pinta cada pestaña y qué dice su cabecera. Ajustes no está en la nav: se llega
// por el avatar y se vuelve con la flecha (o tocando cualquier pestaña).
const PANTALLAS = {
  hoy: { Pantalla: Hoy },
  tareas: { Pantalla: Tareas, titulo: 'Tareas' },
  calendario: { Pantalla: Calendario, titulo: 'Calendario' },
  habitos: { Pantalla: Habitos, titulo: 'Hábitos' },
  estadisticas: { Pantalla: Estadisticas, titulo: 'Stats' },
  ajustes: { Pantalla: Ajustes, titulo: 'Ajustes' },
}

// El hash solo sirve en desarrollo: #muestrario enseña los componentes, #acceso la pantalla de login.
function usarHash() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const alCambiar = () => setHash(window.location.hash)
    window.addEventListener('hashchange', alCambiar)
    return () => window.removeEventListener('hashchange', alCambiar)
  }, [])
  return hash
}

// El proveedor envuelve TODO (también las rutas de desarrollo) para que cualquier
// pantalla pueda pedir `useDatos()` sin preguntarse dónde está montada.
export default function App() {
  return (
    <ProveedorDatos>
      <Raiz />
    </ProveedorDatos>
  )
}

function Raiz() {
  const hash = usarHash()
  const { sesion, sesionLista, aviso, quitarAviso } = useDatos()

  if (hash === '#muestrario') return <Muestrario />
  if (hash === '#acceso') return <Acceso alEntrar={(email) => console.log('entrar', email)} />

  // Hasta saber si hay sesión persistida no se decide nada: evita el parpadeo del login.
  if (!sesionLista) return <div className="arranque">2day</div>

  return (
    <>
      {sesion ? <Armazon /> : <Acceso />}
      <Aviso {...(aviso || {})} alCerrar={quitarAviso} />
    </>
  )
}

function Armazon() {
  const { tareas, hoy, cargando, yo, sesion, nuevaTarea } = useDatos()
  const [pestana, setPestana] = useState('hoy')
  const [pestanaAnterior, setPestanaAnterior] = useState('hoy')

  const enAjustes = pestana === 'ajustes'
  const { Pantalla, titulo, subtitulo } = PANTALLAS[pestana]

  // «Hola Alex» + «N tareas pendientes» (LOGICA §5): el nombre sale de la ficha de equipo.
  // Pendientes = las de Hoy no hechas (la misma fórmula que el «En Hoy» de la rejilla, para
  // que la cabecera y el número de debajo digan lo mismo), no todo lo vivo de la app.
  const nombre = (yo?.nombre || sesion?.user?.email || '').split(/[\s@]/)[0]
  const pendientes = resumenHoy(tareas, hoy).enHoy
  const tituloHoy = nombre ? `Hola ${nombre}` : 'Hola'
  const subtituloHoy = cargando ? 'Cargando…' : pendientes === 1 ? '1 tarea pendiente' : `${pendientes} tareas pendientes`
  const inicial = (nombre || 'A').slice(0, 1).toUpperCase()

  // Cambiar de pestaña vuelve arriba: el navegador conserva el scroll entre renders y una
  // pantalla corta tras una larga aparecía «vacía» (medido en las capturas del 16-09).
  const abrirAjustes = () => { setPestanaAnterior(pestana); setPestana('ajustes'); window.scrollTo(0, 0) }
  const irA = (clave) => { setPestana(clave); window.scrollTo(0, 0) }

  // Desde Hoy, lo capturado entra ya planificado para hoy; desde el resto va a Bandeja limpia.
  const capturar = () => nuevaTarea(pestana === 'hoy' ? { hoyPara: hoy } : {})

  return (
    <div className="app">
      <Cabecera
        titulo={pestana === 'hoy' ? tituloHoy : titulo}
        subtitulo={pestana === 'hoy' ? subtituloHoy : subtitulo}
        inicial={inicial}
        alAvatar={abrirAjustes}
        alAtras={enAjustes ? () => irA(pestanaAnterior) : undefined}
      />

      {/* Solo animación de ENTRADA (key remonta la pantalla). Sin AnimatePresence a propósito:
          Tareas lleva su propio conmutador de pestañas y dos `mode="wait"` anidados dejaban la
          pantalla saliente con opacity 0 esperando una salida que nunca acababa — la app se
          quedaba en negro hasta recargar (medido el 16-09 con Chrome headless). */}
      <motion.div
        key={pestana}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {/* onIrA: Hoy lo usa para los atajos (calendario, Atrasadas/Bandeja); el resto lo ignora */}
        <Pantalla onIrA={irA} />
      </motion.div>

      {!enAjustes && <FAB alPulsar={capturar} />}
      <Nav activa={enAjustes ? null : pestana} alCambiar={irA} />

      {/* las dos hojas viven aquí, una vez, para cualquier pantalla */}
      <DetalleTarea />
      <NuevaTarea />
    </div>
  )
}

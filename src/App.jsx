import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import './estilos/ensamblaje.css'
import './estilos/escritorio.css'
import Cabecera from './componentes/Cabecera.jsx'
import { PESTANAS, ESPACIOS, espacioDe } from './componentes/Nav.jsx'
import SubNav from './componentes/SubNav.jsx'
import MenuRadial from './componentes/MenuRadial.jsx'
import Rail from './componentes/Rail.jsx'
import Aviso from './componentes/Aviso.jsx'
import DetalleTarea from './componentes/DetalleTarea.jsx'
import NuevaTarea from './componentes/NuevaTarea.jsx'
import Hoy from './pantallas/Hoy/Hoy.jsx'
import Tareas from './pantallas/Tareas/Tareas.jsx'
import Calendario from './pantallas/Calendario/Calendario.jsx'
import Habitos from './pantallas/Habitos/Habitos.jsx'
import Fitness from './pantallas/Fitness/Fitness.jsx'
import Estadisticas from './pantallas/Estadisticas/Estadisticas.jsx'
import Meetings from './pantallas/Meetings/Meetings.jsx'
import Eod from './pantallas/Eod/Eod.jsx'
import Finanzas from './pantallas/Finanzas/Finanzas.jsx'
import PantallaFrentes from './pantallas/Frentes/Frentes.jsx'
import Ajustes from './pantallas/Ajustes/Ajustes.jsx'
import Acceso from './pantallas/Acceso/Acceso.jsx'
import Panel from './pantallas/Panel/Panel.jsx'
import Muestrario from './dev/Muestrario.jsx'
import { ProveedorDatos, useDatos } from './estado/useDatos.jsx'
import { usarEscritorio } from './estado/usarEscritorio.js'
import { resumenHoy } from './datos/estadisticas.js'

// Qué pinta cada sección. La cabecera la pone el ESPACIO (LOGICA §18.1): su nombre y su lema;
// Hoy lleva el saludo. Ajustes se llega por el avatar o por el menú radial y se vuelve con la
// flecha (o eligiendo cualquier espacio).
const PANTALLAS = {
  hoy: { Pantalla: Hoy },
  eod: { Pantalla: Eod },
  tareas: { Pantalla: Tareas },
  calendario: { Pantalla: Calendario },
  frentes: { Pantalla: PantallaFrentes },
  meetings: { Pantalla: Meetings },
  habitos: { Pantalla: Habitos },
  fitness: { Pantalla: Fitness },
  finanzas: { Pantalla: Finanzas },
  estadisticas: { Pantalla: Estadisticas },
  ajustes: { Pantalla: Ajustes, titulo: 'Ajustes', subtitulo: 'cómo funciona 2day.' },
}

// El hash: #panel es la ventana del widget (§14.8); #muestrario y #acceso sólo sirven en desarrollo.
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

  // #panel: la ventana estrecha que abre el widget de la barra de menús (LOGICA §14.8).
  if (hash === '#panel' && sesion) return (<><Panel /><Aviso {...(aviso || {})} alCerrar={quitarAviso} /></>)

  return (
    <>
      {sesion ? <Armazon /> : <Acceso />}
      <Aviso {...(aviso || {})} alCerrar={quitarAviso} />
    </>
  )
}

function Armazon() {
  const { tareas, hoy, cargando, yo, sesion, nuevaTarea } = useDatos()
  const escritorio = usarEscritorio()
  const [pestana, setPestana] = useState('hoy')
  const [pestanaAnterior, setPestanaAnterior] = useState('hoy')

  const enAjustes = pestana === 'ajustes'
  const { Pantalla } = PANTALLAS[pestana]
  const espacio = espacioDe(pestana)
  // la última sección abierta de cada espacio: volver a «Trabajo» te deja donde estabas
  const [ultimas, setUltimas] = useState({})

  // «Hola Alex» + «N tareas pendientes» (LOGICA §5): el nombre sale de la ficha de equipo.
  // Pendientes = las de Hoy no hechas (la misma fórmula que el «En Hoy» de la rejilla, para
  // que la cabecera y el número de debajo digan lo mismo), no todo lo vivo de la app.
  const nombre = (yo?.nombre || sesion?.user?.email || '').split(/[\s@]/)[0]
  const pendientes = resumenHoy(tareas, hoy).enHoy
  const tituloHoy = nombre ? `Hola ${nombre}` : 'Hola'
  // el día del reto ya lo enseña la cabecera del reto justo debajo: aquí sólo lo pendiente
  const subtituloHoy = cargando ? 'cargando…' : `— ${pendientes === 1 ? 'una cosa pendiente' : `${pendientes} cosas pendientes`}.`
  const inicial = (nombre || 'A').slice(0, 1).toUpperCase()

  // Cambiar de pestaña vuelve arriba: el navegador conserva el scroll entre renders y una
  // pantalla corta tras una larga aparecía «vacía» (medido en las capturas del 16-09).
  const abrirAjustes = () => { if (pestana === 'ajustes') return; setPestanaAnterior(pestana); setPestana('ajustes'); window.scrollTo(0, 0) }
  const irA = (clave) => {
    setPestana(clave)
    const e = espacioDe(clave)
    if (e) setUltimas((u) => ({ ...u, [e.clave]: clave }))
    window.scrollTo(0, 0)
  }
  const irAEspacio = (clave) => {
    const e = ESPACIOS.find((x) => x.clave === clave)
    if (e) irA(ultimas[clave] || e.secciones[0].clave)
  }

  // Desde Hoy, lo capturado entra ya planificado para hoy; desde el resto va a Bandeja limpia.
  const capturar = () => nuevaTarea(pestana === 'hoy' ? { hoyPara: hoy } : {})

  /* ── atajos de teclado, sólo en escritorio (§10.0-9) ───────────────────── */
  // `1`–`9`/`0` secciones · `t` Hoy · `n` nueva tarea. Escape lo gestiona cada hoja (cierra el
  // panel), así que aquí no se toca. Nada de esto se dispara escribiendo en un campo.
  useEffect(() => {
    if (!escritorio) return undefined
    const alTeclear = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const en = e.target
      if (en && (en.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(en.tagName))) return
      // `1`…`9` y `0` = las diez secciones en el orden de los espacios
      const n = e.key === '0' ? 10 : Number(e.key)
      if (n >= 1 && n <= PESTANAS.length) { irA(PESTANAS[n - 1].clave); return }
      if (e.key === 't' || e.key === 'T') { irA('hoy'); return }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); capturar() }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  })

  const contenido = (
    <>
      <Cabecera
        titulo={pestana === 'hoy' ? tituloHoy : espacio ? espacio.etiqueta : PANTALLAS[pestana].titulo}
        subtitulo={pestana === 'hoy' ? subtituloHoy : `— ${espacio ? espacio.lema : PANTALLAS[pestana].subtitulo}`}
        inicial={inicial}
        alAvatar={escritorio ? undefined : abrirAjustes}
        alAtras={!escritorio && enAjustes ? () => irA(pestanaAnterior) : undefined}
      />
      {espacio && <SubNav secciones={espacio.secciones} activa={pestana} alCambiar={irA} />}

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
    </>
  )

  // En escritorio el armazón es una rejilla raíl | contenido; en móvil, la columna de
  // siempre con nav inferior y FAB. Mismo árbol de pantallas en los dos.
  if (escritorio) {
    return (
      <div className="app app--escritorio">
        <Rail
          activa={enAjustes ? null : pestana}
          alCambiar={irA}
          alNueva={capturar}
          alAjustes={enAjustes ? () => irA(pestanaAnterior) : abrirAjustes}
          enAjustes={enAjustes}
          inicial={inicial}
          nombre={nombre}
        />
        <main className="app-contenido">{contenido}</main>
        {/* las dos hojas viven aquí, una vez, para cualquier pantalla */}
        <DetalleTarea />
        <NuevaTarea />
      </div>
    )
  }

  return (
    <div className="app">
      {contenido}
      {/* el dock de vidrio con el menú radial sustituye a la barra de pestañas y al FAB (§18) */}
      <MenuRadial activa={enAjustes ? null : pestana} alEspacio={irAEspacio} alNueva={capturar} alAjustes={abrirAjustes} />
      <DetalleTarea />
      <NuevaTarea />
    </div>
  )
}

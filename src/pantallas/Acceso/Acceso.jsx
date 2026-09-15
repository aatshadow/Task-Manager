import { useState } from 'react'
import Campo from '../../componentes/Campo.jsx'
import Boton from '../../componentes/Boton.jsx'
import { useDatosOpcional } from '../../estado/useDatos.jsx'

// La pantalla 1 del mockup: fondo negro, título grande en dos líneas, subtítulo en naranja
// apagado, email y contraseña, botón píldora «Entrar».
// Cableada al auth por el contexto: `entrar()` hace `signInWithPassword` y la sesión queda
// persistida (storageKey `hoy:auth`); al resolver, `Raiz` cambia sola al armazón porque
// `sesion` deja de ser null. `alEntrar` sólo se pasa desde fuera en desarrollo (#acceso).
export default function Acceso({ alEntrar, error: errorExterno, cargando: cargandoExterno = false }) {
  const datos = useDatosOpcional()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const listo = email.trim() !== '' && password !== ''
  const ocupado = cargando || cargandoExterno

  const enviar = async (e) => {
    e.preventDefault()
    if (!listo || ocupado) return
    if (alEntrar) { alEntrar(email.trim(), password); return }
    if (!datos?.entrar) { setError('Supabase no está configurado'); return }
    setCargando(true); setError('')
    try {
      await datos.entrar(email.trim(), password)
    } catch (err) {
      setError(err.message || 'No se pudo entrar')
      setCargando(false)
    }
    // Si ha ido bien no se toca `cargando`: esta pantalla se desmonta al llegar la sesión.
  }

  return (
    <main className="app acceso">
      <div className="acceso-marca">2day</div>
      <h1 className="acceso-titulo">Gestiona<br />tu día</h1>
      <p className="acceso-subtitulo">Tus tareas y tus hábitos, en un solo sitio y siempre limpio.</p>

      <form className="acceso-formulario" onSubmit={enviar} noValidate>
        <Campo
          etiqueta="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="tu@correo.com"
          valor={email}
          alCambiar={(v) => { setEmail(v); setError('') }}
          autoFocus
        />
        <Campo
          etiqueta="Contraseña"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          valor={password}
          alCambiar={(v) => { setPassword(v); setError('') }}
        />
        {(error || errorExterno) && <div className="acceso-error" role="alert">{error || errorExterno}</div>}
        <Boton type="submit" completo cargando={ocupado} disabled={!listo}>Entrar</Boton>
      </form>
    </main>
  )
}

import { useState, type FormEvent } from 'react'
import { useStore } from '../store'

export function AuthScreen() {
  const store = useStore()
  const [mode, setMode] = useState<'in' | 'up'>('up')
  const [email, setEmail] = useState('djaramillop7@gmail.com')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage(null)
    setPending(true)
    try {
      if (mode === 'in') await store.signIn(email, password)
      else {
        const note = await store.signUp(email, password)
        if (note) setMessage(note)
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo entrar.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <p className="kicker">Cuentas</p>
        <h1>{mode === 'up' ? 'Crea tu acceso' : 'Entra a tu libro'}</h1>
        <p>La base de datos ya está conectada. La cuenta es tuya: nadie más ve estos movimientos.</p>
        <label className="field">
          Correo
          <input type="email" required value={email} autoComplete="username" onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="field">
          Contraseña
          <input type="password" required minLength={6} value={password} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {message && <p className="hint">{message}</p>}
        <button className="btn primary" disabled={pending} type="submit">
          {pending ? 'Espera…' : mode === 'up' ? 'Crear cuenta' : 'Entrar'}
        </button>
        <button className="btn ghost" type="button" onClick={() => setMode(mode === 'up' ? 'in' : 'up')}>
          {mode === 'up' ? 'Ya tengo cuenta' : 'Crear una cuenta'}
        </button>
        <button className="text-btn" type="button" onClick={() => store.disconnect()}>
          Seguir solo en este navegador
        </button>
      </form>
    </main>
  )
}

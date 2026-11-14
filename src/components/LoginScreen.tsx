import { useState, type FormEvent } from 'react'
import { login } from '../session'

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage(null)
    setPending(true)
    try {
      const ok = await login(user, password)
      if (!ok) {
        setMessage('Usuario o contraseña incorrectos.')
        return
      }
      location.hash = '#/inicio'
      onSuccess()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="app">
      <main className="auth">
        <form className="auth-card" onSubmit={submit}>
          <p className="kicker">Acceso</p>
          <h1>Entra a la app</h1>
          <p>Cuentas y pendientes quedan en este teléfono.</p>
          <label className="field">
            Usuario
            <input
              required
              autoCapitalize="none"
              autoComplete="username"
              value={user}
              onChange={(event) => setUser(event.target.value)}
            />
          </label>
          <label className="field">
            Contraseña
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {message && <p className="hint">{message}</p>}
          <button className="btn primary" disabled={pending} type="submit">
            {pending ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </main>
    </div>
  )
}

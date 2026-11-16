import { useState, type FormEvent } from 'react'
import { login, register } from '../session'
import { PasswordField } from './PasswordField'

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage(null)
    setPending(true)
    try {
      if (mode === 'register') {
        const error = await register(user, password)
        if (error) {
          setMessage(error)
          return
        }
      } else {
        const ok = await login(user, password)
        if (!ok) {
          setMessage('Usuario o contraseña incorrectos.')
          return
        }
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
          <h1>{mode === 'register' ? 'Registrar usuario' : 'Entra a la app'}</h1>
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
          <PasswordField
            key={mode}
            label="Contraseña"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            value={password}
            onChange={setPassword}
          />
          {message && <p className="hint">{message}</p>}
          <button className="btn primary" disabled={pending} type="submit">
            {pending ? 'Cargando' : mode === 'register' ? 'Registrar usuario' : 'Entrar'}
          </button>
          {mode === 'login' ? (
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setMode('register')
                setMessage(null)
              }}
            >
              Registrar usuario
            </button>
          ) : (
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setMode('login')
                setMessage(null)
              }}
            >
              Entrar
            </button>
          )}
        </form>
      </main>
    </div>
  )
}

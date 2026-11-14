import { useState, type FormEvent } from 'react'
import { isDB } from '../types'
import { useStore } from '../store'
import type { SupabaseConfig } from '../remote'

export function SettingsView() {
  const store = useStore()
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function connect(event: FormEvent) {
    event.preventDefault()
    setMessage(null)
    const config: SupabaseConfig = { url: url.trim(), key: key.trim() }
    if (!config.url.startsWith('https://') || !config.url.includes('supabase')) {
      setMessage('La URL debe ser la de tu proyecto, por ejemplo https://xxxx.supabase.co')
      return
    }
    if (config.key.length < 20) {
      setMessage('Pega la anon public key completa.')
      return
    }
    setPending(true)
    try {
      await store.connect(config)
      setMessage('Conectado. Si pide cuenta, créala en la siguiente pantalla.')
      setUrl('')
      setKey('')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo conectar.')
    } finally {
      setPending(false)
    }
  }

  function exportDB() {
    const blob = new Blob([JSON.stringify(store.db, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `cuentas-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  function importFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as unknown
        if (!isDB(parsed)) throw new Error('Ese archivo no es un respaldo de Cuentas.')
        store.importDB(parsed)
        setMessage('Respaldo importado.')
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'No se pudo importar.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="wrap settings">
      <header className="page-head">
        <div>
          <p className="kicker">Administrar</p>
          <h1 className="page-title">Ajustes</h1>
        </div>
      </header>

      <section className="panel">
        <div className="panel-top">
          <h2>Base de datos</h2>
          <span className={store.mode === 'local' ? 'pill' : 'pill on'}>
            {store.mode === 'neon' ? 'Neon' : store.mode === 'supabase' ? 'Supabase' : 'Este navegador'}
          </span>
        </div>
        {store.mode === 'neon' ? (
          <p>Los cambios se guardan en Neon. También queda una copia en este navegador.</p>
        ) : store.mode === 'local' ? (
          <>
            <p>
              En este teléfono los datos ya se guardan solos. Para que también vivan en la nube, con la cuenta djaramillop7@gmail.com, conecta un proyecto gratis de{' '}
              <a href="https://supabase.com" target="_blank" rel="noreferrer">
                Supabase
              </a>
              .
            </p>
            <ol className="steps">
              <li>Crea un proyecto en Supabase.</li>
              <li>En SQL Editor pega y ejecuta el archivo <code>supabase/schema.sql</code> de este proyecto.</li>
              <li>En Authentication desactiva “Confirm email”.</li>
              <li>En Settings → API copia la Project URL y la anon key aquí.</li>
            </ol>
            <form className="stack" onSubmit={connect}>
              <label className="field">
                Project URL
                <input value={url} placeholder="https://xxxx.supabase.co" onChange={(event) => setUrl(event.target.value)} autoComplete="off" />
              </label>
              <label className="field">
                Anon public key
                <input value={key} placeholder="eyJhbGciOi..." onChange={(event) => setKey(event.target.value)} autoComplete="off" />
              </label>
              <button className="btn primary" disabled={pending} type="submit">
                {pending ? 'Conectando…' : 'Conectar Supabase'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p>
              Los cambios se guardan en Supabase{store.email ? ` con ${store.email}` : ''}. También queda una copia en este navegador.
            </p>
            <div className="head-actions">
              {store.email && (
                <button className="btn" onClick={() => store.signOut()}>
                  Cerrar sesión
                </button>
              )}
              <button className="btn danger" onClick={() => store.disconnect()}>
                Desconectar base de datos
              </button>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Respaldo</h2>
        <p>Descarga el libro o recupéralo desde un archivo JSON.</p>
        <div className="head-actions">
          <button className="btn" onClick={exportDB}>
            Exportar JSON
          </button>
          <label className="btn">
            Importar JSON
            <input
              className="file"
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) importFile(file)
                event.target.value = ''
              }}
            />
          </label>
        </div>
      </section>

      {message && <p className="hint alone">{message}</p>}
    </div>
  )
}

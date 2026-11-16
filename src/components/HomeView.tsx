import { useRef } from 'react'
import { go, goSettings, openCuentas, openPrivate } from '../route'
import { can, currentUser, isDiego } from '../session'
import { Mark } from '../icons'

export function HomeView({ onLogout }: { onLogout: () => void }) {
  const last = useRef(0)
  const owner = isDiego()
  const name = currentUser()
  const label = name ? name.charAt(0).toUpperCase() + name.slice(1) : ''
  const cuentas = can('cuentas')
  const pendientes = can('pendientes')
  const calendario = can('calendario')
  const ajustes = can('ajustes')

  function secretTap() {
    if (!owner) return
    const now = Date.now()
    if (now - last.current < 600) {
      last.current = 0
      openPrivate()
      return
    }
    last.current = now
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <button type="button" className="name-lock" onPointerUp={secretTap}>
            Hola, {label}
          </button>
          <small>{pendientes || calendario ? 'Elige un módulo' : 'Cuentas'}</small>
        </div>
        {ajustes && (
          <button className="icon-btn" aria-label="Configuración" onClick={() => goSettings('general')}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6" />
            </svg>
          </button>
        )}
        {calendario && (
          <button className="icon-btn cal" aria-label="Calendario" onClick={() => go('calendario')}>
            <Mark name="Calendario" />
          </button>
        )}
        <button className="btn ghost" onClick={onLogout}>
          Salir
        </button>
      </header>
      <main className="main">
        <div className="icon-grid">
          {cuentas && (
          <button className="icon-box" style={{ ['--chip' as string]: '#60a5fa' }} onClick={openCuentas}>
            <Mark name="Cuentas" />
            <strong>Cuentas</strong>
          </button>
          )}
          {pendientes && (
            <button className="icon-box" style={{ ['--chip' as string]: '#f472b6' }} onClick={() => go('pendientes')}>
              <Mark name="Pendientes" />
              <strong>Pendientes</strong>
            </button>
          )}
        </div>
      </main>
    </>
  )
}


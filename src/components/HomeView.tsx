import { useRef } from 'react'
import { go, openCuentas, openPrivate } from '../route'
import { Mark } from '../icons'

export function HomeView({ onLogout }: { onLogout: () => void }) {
  const last = useRef(0)

  function secretTap() {
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
            Hola, Diego
          </button>
          <small>Elige un módulo</small>
        </div>
        <button className="icon-btn cal" aria-label="Calendario" onClick={() => go('calendario')}>
          <Mark name="Calendario" />
        </button>
        <button className="btn ghost" onClick={onLogout}>
          Salir
        </button>
      </header>
      <main className="main">
        <div className="icon-grid">
          <button className="icon-box" style={{ ['--chip' as string]: '#60a5fa' }} onClick={openCuentas}>
            <Mark name="Cuentas" />
            <strong>Cuentas</strong>
          </button>
          <button className="icon-box" style={{ ['--chip' as string]: '#f472b6' }} onClick={() => go('pendientes')}>
            <Mark name="Pendientes" />
            <strong>Pendientes</strong>
          </button>
        </div>
      </main>
    </>
  )
}

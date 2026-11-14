import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StoreProvider, useStore } from './store'
import { go, goPeriod, readRoute, type Route } from './route'
import { periodStats } from './types'
import { formatCOP } from './money'
import { PeriodView } from './components/PeriodView'
import { YearView } from './components/YearView'
import { CategoriesView } from './components/CategoriesView'
import { RecurrentesView } from './components/RecurrentesView'
import { SettingsView } from './components/SettingsView'
import { ReportsView } from './components/ReportsView'
import { AuthScreen } from './components/AuthScreen'
import { LoginScreen } from './components/LoginScreen'
import { HomeView } from './components/HomeView'
import { PendientesView } from './components/PendientesView'
import { VaultView } from './components/VaultView'
import { CalendarView } from './components/CalendarView'
import { isLoggedIn, logout } from './session'
import { queueDayAlerts } from './reminders'
import { MONTHS } from './types'

function useRoute(): Route {
  const [route, setRoute] = useState(readRoute)
  useEffect(() => {
    const sync = () => setRoute(readRoute())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  return route
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const store = useStore()
  const route = useRoute()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const years = useMemo(() => {
    const set = new Set(store.db.periods.map((p) => p.year))
    set.add(year)
    const list = Array.from(set).sort((a, b) => a - b)
    const upcoming = (list[list.length - 1] ?? year) + 1
    if (!list.includes(upcoming)) list.push(upcoming)
    return list
  }, [store.db.periods, year])

  const periods = store.db.periods.filter((p) => p.year === year).sort((a, b) => a.sortOrder - b.sortOrder)
  const selected = store.db.periods.find((p) => p.id === route.periodId) ?? null
  const [sheet, setSheet] = useState(false)
  const openedPeriod = useRef(false)

  useEffect(() => {
    if (!store.ready || store.needsAuth) return
    if (route.view === 'periodo' && route.periodId && selected) setYear(selected.year)
  }, [store.ready, store.needsAuth, route.view, route.periodId, selected])

  useEffect(() => {
    if (!store.ready || store.needsAuth) return
    if (route.view !== 'periodo') return
    if (openedPeriod.current && route.periodId) return
    openedPeriod.current = true
    const today = new Date()
    const months = store.ensureYear(today.getFullYear())
    const match = months.find((period) => period.coveredMonth === today.getMonth())
    if (!match) return
    setYear(today.getFullYear())
    if (route.periodId !== match.id) location.replace(`#/p/${match.id}`)
  }, [store.ready, store.needsAuth, route.view, route.periodId, store])

  useEffect(() => {
    if (route.view !== 'periodo') return
    document.querySelector('.chip.on')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [route.view, selected?.id, year])

  useEffect(() => {
    if (!store.ready) return
    queueDayAlerts()
  }, [store.ready, store.db])

  function openMes() {
    const today = new Date()
    const months = store.ensureYear(today.getFullYear())
    const match = months.find((period) => period.coveredMonth === today.getMonth()) ?? months[0]
    if (!match) return
    setYear(today.getFullYear())
    goPeriod(match.id)
  }

  if (route.view === 'inicio') {
    return (
      <div className="app home-app">
        <HomeView onLogout={onLogout} />
      </div>
    )
  }

  if (route.view === 'pendientes') {
    return (
      <div className="app board-app">
        <PendientesView />
      </div>
    )
  }

  if (route.view === 'calendario') {
    if (!store.ready) return <div className="boot">Abriendo el libro…</div>
    return (
      <div className="app">
        <CalendarView />
      </div>
    )
  }

  if (route.view === 'privado') {
    return (
      <div className="app">
        <VaultView />
      </div>
    )
  }

  if (!store.ready) {
    return <div className="boot">Abriendo el libro…</div>
  }

  if (store.needsAuth) return <AuthScreen />

  const moreOn = route.view === 'categorias' || route.view === 'ajustes'

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-btn" aria-label="Inicio" onClick={() => go('inicio')}>
          <Glyph>
            <path d="M4 11.5 12 4l8 7.5" />
            <path d="M7 10.5V20h10v-9.5" />
          </Glyph>
        </button>
        <div className="brand">
          <span>Cuentas</span>
          <small>{store.mode === 'local' ? 'En este teléfono' : 'En la nube'}</small>
        </div>
        <label className="year-label">
          <span className="sr">Año</span>
          <select
            className="year-select"
            value={year}
            onChange={(event) => {
              const next = Number(event.target.value)
              setYear(next)
              const months = store.ensureYear(next)
              const today = new Date()
              const match =
                (next === today.getFullYear() ? months.find((period) => period.coveredMonth === today.getMonth()) : null) ??
                months.find((period) => period.coveredMonth === 0) ??
                months[0]
              if (match) goPeriod(match.id)
            }}
          >
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button className={moreOn || sheet ? 'icon-btn on' : 'icon-btn'} aria-label="Más opciones" onClick={() => setSheet(true)}>
          <Glyph>
            <circle cx="12" cy="6" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="12" cy="18" r="1.2" fill="currentColor" stroke="none" />
          </Glyph>
        </button>
      </header>

      {route.view === 'periodo' && (
        <div className="chips" aria-label="Meses">
          {periods.map((period) => {
            const stats = periodStats(store.db, period.id)
            const active = period.id === selected?.id
            return (
              <button key={period.id} className={active ? 'chip on' : 'chip'} onClick={() => goPeriod(period.id)}>
                <strong>{MONTHS[period.coveredMonth].slice(0, 3)}</strong>
                <em className={stats.libre < 0 ? 'neg' : 'pos'}>{formatCOP(stats.libre)}</em>
              </button>
            )
          })}
        </div>
      )}

      <main className="main">
        {route.view === 'anio' && <YearView year={year} onYear={setYear} />}
        {route.view === 'reportes' && <ReportsView year={year} />}
        {route.view === 'recurrentes' && <RecurrentesView />}
        {route.view === 'categorias' && <CategoriesView />}
        {route.view === 'ajustes' && <SettingsView />}
        {route.view === 'periodo' && selected && (
          <PeriodView period={selected} />
        )}
        {route.view === 'periodo' && !selected && (
          <div className="wrap">
            <h1 className="page-title">Ese periodo no está</h1>
            <button className="btn primary" onClick={() => go('anio')}>
              Ver el año
            </button>
          </div>
        )}
      </main>

      <nav className="tabbar" aria-label="Secciones">
        <button className={route.view === 'periodo' ? 'tab on' : 'tab'} onClick={openMes}>
          <Glyph>
            <rect x="4" y="5" width="16" height="15" rx="2" />
            <path d="M8 3.5v3M16 3.5v3M4 10h16" />
          </Glyph>
          Mes
        </button>
        <button className={route.view === 'anio' ? 'tab on' : 'tab'} onClick={() => go('anio')}>
          <Glyph>
            <rect x="4" y="4" width="7" height="7" rx="1.5" />
            <rect x="13" y="4" width="7" height="7" rx="1.5" />
            <rect x="4" y="13" width="7" height="7" rx="1.5" />
            <rect x="13" y="13" width="7" height="7" rx="1.5" />
          </Glyph>
          Año
        </button>
        <button className={route.view === 'reportes' ? 'tab on' : 'tab'} onClick={() => go('reportes')}>
          <Glyph>
            <path d="M5 19V10M12 19V5M19 19v-7" />
          </Glyph>
          Reportes
        </button>
        <button className={route.view === 'recurrentes' ? 'tab on' : 'tab'} onClick={() => go('recurrentes')}>
          <Glyph>
            <path d="M4 12a8 8 0 0 1 13.5-5.8L20 8" />
            <path d="M20 4v4h-4" />
            <path d="M20 12a8 8 0 0 1-13.5 5.8L4 16" />
            <path d="M4 20v-4h4" />
          </Glyph>
          Fijos
        </button>
      </nav>

      {sheet && (
        <div className="sheet-back" onClick={() => setSheet(false)}>
          <div className="sheet" role="dialog" aria-label="Más opciones" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-title">
              <h2>Más</h2>
              <button className="text-btn" type="button" onClick={() => setSheet(false)}>
                Cerrar
              </button>
            </div>
            <button
              className="sheet-item"
              onClick={() => {
                setSheet(false)
                go('categorias')
              }}
            >
              <span>Categorías</span>
              <small>Colores y grupos</small>
            </button>
            <button
              className="sheet-item"
              onClick={() => {
                setSheet(false)
                go('ajustes')
              }}
            >
              <span>Ajustes</span>
              <small>Nube, copia y respaldo</small>
            </button>
            <button
              className="sheet-item"
              onClick={() => {
                setSheet(false)
                onLogout()
              }}
            >
              <span>Cerrar sesión</span>
              <small>Volver al acceso</small>
            </button>
          </div>
        </div>
      )}

      {store.error && (
        <div className="toast" role="status">
          <p>{store.error}</p>
          <button onClick={store.clearError}>Cerrar</button>
        </div>
      )}
    </div>
  )
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

export function App() {
  const [authed, setAuthed] = useState(isLoggedIn)
  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />
  return (
    <StoreProvider>
      <Shell
        onLogout={() => {
          logout()
          location.hash = '#/inicio'
          setAuthed(false)
        }}
      />
    </StoreProvider>
  )
}

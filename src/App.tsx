import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StoreProvider, useStore } from './store'
import { go, goPeriod, goSettings, readRoute, type Route } from './route'
import { debtApplied, periodIsListed, periodStats } from './types'
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
import { can, isDiego, isLoggedIn, logout } from './session'
import { loadNotes } from './vault'
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
    const today = new Date()
    const set = new Set(store.db.periods.filter((period) => periodIsListed(store.db, period, today)).map((period) => period.year))
    if (!set.size) set.add(today.getFullYear())
    return Array.from(set).sort((a, b) => a - b)
  }, [store.db])

  const debtToDate = (store.db.debts ?? []).reduce((sum, debt) => sum + Math.max(0, debt.total - debtApplied(store.db, debt.id).paid), 0)
  const today = new Date()
  const periods = store.db.periods
    .filter((period) => period.year === year && periodIsListed(store.db, period, today))
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const selected = store.db.periods.find((p) => p.id === route.periodId) ?? null
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
    if (!store.ready || store.needsAuth) return
    if (route.view !== 'periodo' || !selected) return
    if (periodIsListed(store.db, selected)) return
    const fallback = store.db.periods
      .filter((period) => period.year === selected.year && periodIsListed(store.db, period))
      .sort((a, b) => b.sortOrder - a.sortOrder)[0]
    if (fallback) goPeriod(fallback.id)
  }, [store.ready, store.needsAuth, route.view, selected, store.db])

  useEffect(() => {
    if (route.view !== 'periodo') return
    document.querySelector('.chip.on')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [route.view, selected?.id, year])

  useEffect(() => {
    if (!store.ready || store.needsAuth || !isDiego()) return
    void loadNotes()
  }, [store.ready, store.needsAuth])

  useEffect(() => {
    if (!store.ready) return
    queueDayAlerts(store.db)
  }, [store.ready, store.db])

  function openMes() {
    const today = new Date()
    const months = store.ensureYear(today.getFullYear())
    const match = months.find((period) => period.coveredMonth === today.getMonth()) ?? months[0]
    if (!match) return
    setYear(today.getFullYear())
    goPeriod(match.id)
  }

  const blocked =
    (route.view === 'pendientes' && !can('pendientes')) ||
    (route.view === 'calendario' && !can('calendario')) ||
    (route.view === 'privado' && !isDiego()) ||
    (route.view === 'ajustes' && route.settings !== 'cuentas' && !can('ajustes'))

  if (route.view === 'inicio' || blocked) {
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
    if (!store.ready) return <div className="boot">Cargando</div>
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
    return <div className="boot">Cargando</div>
  }

  if (store.needsAuth) return <AuthScreen />

  if (route.view === 'ajustes' && route.settings !== 'cuentas') {
    const back = route.settings === 'pendientes' ? 'pendientes' : 'inicio'
    return (
      <div className="app">
        <header className="topbar">
          <button className="icon-btn" aria-label={back === 'pendientes' ? 'Pendientes' : 'Inicio'} onClick={() => go(back)}>
            <Glyph>
              <path d="M4 11.5 12 4l8 7.5" />
              <path d="M7 10.5V20h10v-9.5" />
            </Glyph>
          </button>
          <div className="brand">
            <span>Configuración</span>
            <small>{route.settings === 'pendientes' ? 'Pendientes' : 'General'}</small>
          </div>
        </header>
        <main className="main">
          <SettingsView scope={route.settings ?? 'general'} />
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="icon-btn"
          aria-label={route.view === 'periodo' || route.view === 'anio' || route.view === 'reportes' ? 'Inicio' : 'Mes'}
          onClick={() => (route.view === 'periodo' || route.view === 'anio' || route.view === 'reportes' ? go('inicio') : openMes())}
        >
          <Glyph>
            <path d="M4 11.5 12 4l8 7.5" />
            <path d="M7 10.5V20h10v-9.5" />
          </Glyph>
        </button>
        <div className="brand">
          <span>Cuentas</span>
          <small>En la nube</small>
        </div>
        <label className="year-label">
          <span className="sr">Año</span>
          <select
            className="year-select"
            value={year}
            onChange={(event) => {
              const next = Number(event.target.value)
              setYear(next)
              const today = new Date()
              const months = (next === today.getFullYear() ? store.ensureYear(next) : store.db.periods.filter((period) => period.year === next)).filter((period) =>
                periodIsListed(store.db, period, today),
              )
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
        <button
          className={route.view === 'ajustes' || route.view === 'categorias' || route.view === 'recurrentes' ? 'icon-btn on' : 'icon-btn'}
          aria-label="Configuración"
          onClick={() => (route.view === 'ajustes' ? openMes() : goSettings('cuentas'))}
        >
          <Glyph>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6" />
          </Glyph>
        </button>
      </header>

      {route.view === 'periodo' && debtToDate > 0 && (
        <p className="debt-asof">
          <span>Deudas a la fecha</span>
          <b>{formatCOP(debtToDate)}</b>
        </p>
      )}

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
        {route.view === 'ajustes' && route.settings === 'cuentas' && <SettingsView scope="cuentas" />}
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

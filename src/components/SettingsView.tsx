import { useEffect, useState } from 'react'
import { MONTHS, isDB } from '../types'
import { go } from '../route'
import { useStore } from '../store'
import { useBoard } from '../tasks'
import { DebtsPanel } from './DebtsPanel'
import { Fold } from './Fold'

function ProjectionPanel() {
  const store = useStore()
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth()
  const earliest = [...store.db.periods].sort((a, b) => a.sortOrder - b.sortOrder)[0]
  const saved = store.db.projection
  const [fromYear, setFromYear] = useState(saved?.fromYear ?? earliest?.year ?? currentYear)
  const [fromMonth, setFromMonth] = useState(saved?.fromMonth ?? earliest?.coveredMonth ?? 0)
  const [toYear, setToYear] = useState(saved?.toYear ?? currentYear)
  const [toMonth, setToMonth] = useState(saved?.toMonth ?? currentMonth)
  const fromYears = Array.from({ length: 11 }, (_, index) => currentYear - 10 + index)
  const toYears = Array.from({ length: 4 }, (_, index) => currentYear + index)

  useEffect(() => {
    if (!saved) return
    setFromYear(saved.fromYear)
    setFromMonth(saved.fromMonth)
    setToYear(saved.toYear)
    setToMonth(saved.toMonth)
  }, [saved])

  function monthsFor(year: number, side: 'from' | 'to') {
    const start = side === 'to' && year === currentYear ? currentMonth : 0
    const end = side === 'from' && year === currentYear ? currentMonth : 11
    return MONTHS.map((name, index) => ({ name, index })).filter((item) => item.index >= start && item.index <= end)
  }

  return (
    <section className="projection" aria-label="Proyección">
      <div>
        <p className="kicker">Desde</p>
        <div className="projection-row">
          <label className="field">
            Mes
            <select aria-label="Mes desde" value={fromMonth} onChange={(event) => setFromMonth(Number(event.target.value))}>
              {monthsFor(fromYear, 'from').map((item) => (
                <option key={item.index} value={item.index}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Año
            <select
              aria-label="Año desde"
              value={fromYear}
              onChange={(event) => {
                const year = Number(event.target.value)
                setFromYear(year)
                if (year === currentYear) setFromMonth((month) => Math.min(month, currentMonth))
              }}
            >
              {fromYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div>
        <p className="kicker">Hasta</p>
        <div className="projection-row">
          <label className="field">
            Mes
            <select aria-label="Mes hasta" value={toMonth} onChange={(event) => setToMonth(Number(event.target.value))}>
              {monthsFor(toYear, 'to').map((item) => (
                <option key={item.index} value={item.index}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Año
            <select
              aria-label="Año hasta"
              value={toYear}
              onChange={(event) => {
                const year = Number(event.target.value)
                setToYear(year)
                if (year === currentYear) setToMonth((month) => Math.max(month, currentMonth))
              }}
            >
              {toYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <button type="button" className="btn primary" onClick={() => store.setProjection({ fromYear, fromMonth, toYear, toMonth })}>
        Guardar
      </button>
    </section>
  )
}

export function SettingsView({ scope }: { scope: 'general' | 'cuentas' | 'pendientes' }) {
  const store = useStore()
  const board = useBoard()
  const today = new Date()
  const cuentasPeriod =
    store.db.periods.find((period) => period.year === today.getFullYear() && period.coveredMonth === today.getMonth()) ??
    [...store.db.periods].sort((a, b) => b.sortOrder - a.sortOrder)[0]
  const [taskName, setTaskName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [section, setSection] = useState<'deudas' | 'proyeccion' | null>(null)

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
          <p className="kicker">Configuración</p>
          <h1 className="page-title">{scope === 'cuentas' ? 'Cuentas' : scope === 'pendientes' ? 'Pendientes' : 'General'}</h1>
        </div>
      </header>

      {scope === 'cuentas' && (
        <>
        <p className="formula">Un ítem es un ingreso o un gasto. Siempre lleva una categoría. En el mes se elige si es variable o fijo.</p>
        <nav className="config-links" aria-label="Cuentas">
          <button type="button" onClick={() => go('categorias')}>
            <span>Categorías</span>
            <small>Los grupos. Cada gasto y cada ingreso pertenece a una.</small>
          </button>
          <button type="button" onClick={() => go('recurrentes')}>
            <span>Fijos</span>
            <small>Ítems que se copian en todos los meses, con su valor.</small>
          </button>
          <button type="button" onClick={() => setSection((open) => (open === 'deudas' ? null : 'deudas'))}>
            <span>Deudas</span>
            <small>Cuotas que se pagan dentro de los gastos del mes.</small>
          </button>
          {section === 'deudas' && cuentasPeriod && <DebtsPanel period={cuentasPeriod} manage bare />}
          <button type="button" onClick={() => setSection((open) => (open === 'proyeccion' ? null : 'proyeccion'))}>
            <span>Proyección</span>
            <small>Desde y hasta cuándo se ven los meses y los años.</small>
          </button>
          {section === 'proyeccion' && <ProjectionPanel />}
        </nav>
        </>
      )}

      {scope === 'general' && (
      <>
      <section className="panel">
        <div className="panel-top">
          <h2>Base de datos</h2>
          <span className="pill on">{store.mode === 'supabase' ? 'Supabase' : 'Neon'}</span>
        </div>
        {store.mode !== 'supabase' && <p>Los cambios se guardan en la base de datos en línea.</p>}
        {store.mode === 'supabase' ? (
          <>
            <p>Los cambios se guardan en la base de datos en línea{store.email ? ` con ${store.email}` : ''}.</p>
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
        ) : null}
      </section>

      <section className="panel">
        <h2>Respaldo</h2>
        <p>Descarga los datos o recupéralos desde un archivo JSON.</p>
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
      </>
      )}

      {message && scope === 'general' && <p className="hint alone">{message}</p>}

      {scope === 'pendientes' && (
      <section className="config-module" aria-label="Pendientes">
        <h2>Pendientes</h2>
        <Fold title="Categorías" meta={board.categories.length}>
        <p className="hint">Cambia el nombre o el color. Si la eliminas, sus tareas pasan a Varios.</p>
        <ol className="order-list">
          {board.categories.map((category, index) => {
            const fixed = category.name.trim().toLowerCase() === 'varios'
            const nextFixed = board.categories[index + 1]?.name.trim().toLowerCase() === 'varios'
            return (
            <li key={category.id}>
              <button type="button" className="dot-btn" aria-label={`Cambiar color de ${category.name}`} onClick={() => board.recolorCategory(category.id)}>
                <i className="dot" style={{ background: category.color }} />
              </button>
              <input
                aria-label={`Nombre de ${category.name}`}
                value={category.name}
                readOnly={fixed}
                onChange={(event) => board.updateCategory(category.id, { name: event.target.value })}
              />
              <button type="button" aria-label={`Subir ${category.name}`} disabled={fixed || index === 0} onClick={() => board.moveCategory(category.id, -1)}>
                ↑
              </button>
              <button
                type="button"
                aria-label={`Bajar ${category.name}`}
                disabled={fixed || nextFixed || index === board.categories.length - 1}
                onClick={() => board.moveCategory(category.id, 1)}
              >
                ↓
              </button>
              <button type="button" aria-label={`Eliminar ${category.name}`} disabled={fixed} onClick={() => board.removeCategory(category.id)}>
                ×
              </button>
            </li>
            )
          })}
        </ol>
        </Fold>
        <form
          className="order-add"
          onSubmit={(event) => {
            event.preventDefault()
            const name = taskName.trim()
            if (!name) return
            board.addCategory(name)
            setTaskName('')
          }}
        >
          <input value={taskName} placeholder="Nueva categoría" aria-label="Nueva categoría de pendientes" onChange={(event) => setTaskName(event.target.value)} />
          <button className="btn" type="submit">
            Agregar
          </button>
        </form>
      </section>
      )}
    </div>
  )
}

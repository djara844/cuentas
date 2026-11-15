import { useState } from 'react'
import { isDB } from '../types'
import { go } from '../route'
import { useStore } from '../store'
import { TASK_COLORS, useBoard } from '../tasks'
import { DebtsPanel } from './DebtsPanel'
import { Fold } from './Fold'

export function SettingsView({ scope }: { scope: 'general' | 'cuentas' | 'pendientes' }) {
  const store = useStore()
  const board = useBoard()
  const today = new Date()
  const cuentasPeriod =
    store.db.periods.find((period) => period.year === today.getFullYear() && period.coveredMonth === today.getMonth()) ??
    [...store.db.periods].sort((a, b) => b.sortOrder - a.sortOrder)[0]
  const [taskName, setTaskName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [debtsOpen, setDebtsOpen] = useState(false)

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
          <button type="button" onClick={() => setDebtsOpen((open) => !open)}>
            <span>Deudas</span>
            <small>Cuotas que se pagan dentro de los gastos del mes.</small>
          </button>
        </nav>
        {debtsOpen && cuentasPeriod && <DebtsPanel period={cuentasPeriod} manage bare />}
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
      </>
      )}

      {message && scope === 'general' && <p className="hint alone">{message}</p>}

      {scope === 'pendientes' && (
      <section className="config-module" aria-label="Pendientes">
        <h2>Pendientes</h2>
        <Fold title="Categorías" meta={board.categories.length}>
        <p className="hint">Categorías en el orden del tablero.</p>
        <ol className="order-list">
          {board.categories.map((category, index) => (
            <li key={category.id}>
              <i className="dot" style={{ background: category.color }} />
              <input
                aria-label={`Nombre de ${category.name}`}
                value={category.name}
                onChange={(event) => board.updateCategory(category.id, { name: event.target.value })}
              />
              <button type="button" aria-label={`Subir ${category.name}`} disabled={index === 0} onClick={() => board.moveCategory(category.id, -1)}>
                ↑
              </button>
              <button
                type="button"
                aria-label={`Bajar ${category.name}`}
                disabled={index === board.categories.length - 1}
                onClick={() => board.moveCategory(category.id, 1)}
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
        </Fold>
        <form
          className="order-add"
          onSubmit={(event) => {
            event.preventDefault()
            const name = taskName.trim()
            if (!name) return
            board.addCategory(name, TASK_COLORS[board.categories.length % TASK_COLORS.length])
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

import { useMemo, useState, type FormEvent } from 'react'
import { go } from '../route'
import { NOTES, confirmGate, loadExtra, loadOverrides, noteReport, saveExtra, saveOverride, type Note } from '../vault'
import { Fold } from './Fold'

export function VaultView() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(false)
    const ok = await confirmGate(password)
    setPending(false)
    if (!ok) {
      setError(true)
      setPassword('')
      return
    }
    setPassword('')
    setOpen(true)
  }

  if (open) return <Record />

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" aria-label="Inicio" onClick={() => go('inicio')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 11.5 12 4l8 7.5" />
            <path d="M7 10.5V20h10v-9.5" />
          </svg>
        </button>
        <div className="brand">
          <span>Confirmar</span>
          <small>Segunda clave</small>
        </div>
      </header>
      <main className="main"><form className="auth-card gate" onSubmit={submit}>
        <label className="field">
          Clave
          <input
            type="password"
            value={password}
            autoFocus
            autoComplete="off"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="hint">Clave incorrecta.</p>}
        <button className="btn primary" type="submit" disabled={pending || password.length === 0}>
          {pending ? 'Espera…' : 'Entrar'}
        </button>
      </form></main>
    </>
  )
}

function Record() {
  const [extra, setExtra] = useState<Note[]>(loadExtra)
  const [overrides, setOverrides] = useState<Record<string, Note>>(loadOverrides)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<{ key: string; extraIndex: number | null; note: Note } | null>(null)
  const rows = useMemo(
    () => [
      ...NOTES.map((note, index) => ({ key: `base:${index}`, extraIndex: null as number | null, note: overrides[`base:${index}`] ?? note })),
      ...extra.map((note, index) => ({ key: `extra:${index}`, extraIndex: index, note })),
    ],
    [extra, overrides],
  )
  const notes = useMemo(() => rows.map((row) => row.note), [rows])
  const report = useMemo(() => noteReport(notes), [notes])
  const [openYear, setOpenYear] = useState<number | null>(null)
  const maxYear = Math.max(1, ...report.years.map((year) => year.count))

  function addWoman(note: Note) {
    const next = [...extra, note]
    setExtra(next)
    saveExtra(next)
    setAdding(false)
    setOpenYear(note.year)
  }

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" aria-label="Inicio" onClick={() => go('inicio')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 11.5 12 4l8 7.5" />
            <path d="M7 10.5V20h10v-9.5" />
          </svg>
        </button>
        <div className="brand">
          <span>Registro</span>
          <small>Solo en este teléfono</small>
        </div>
        <button className={adding ? 'icon-btn plus on' : 'icon-btn plus'} type="button" aria-label="Agregar" onClick={() => setAdding((current) => !current)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </header>
      <main className="main">
    <div className="wrap">
      <section className="panel summary-line" aria-label="Resumen">
        <div>
          <span>Mujeres</span>
          <strong>{report.total}</strong>
        </div>
      </section>

      {adding && <AddWoman onAdd={addWoman} />}

      <Fold title="Por año" meta={report.years.length}>
        <ul className="bars">
          {report.years.map((year) => (
            <li key={year.year}>
              <div className="bar-label">
                <span>
                  {year.year}
                  <em className="age">{year.age}</em>
                </span>
                <strong>{year.count}</strong>
              </div>
              <div className="bar" aria-hidden="true">
                <span style={{ width: `${Math.max(6, (year.count / maxYear) * 100)}%`, background: '#fbbf24' }} />
              </div>
            </li>
          ))}
        </ul>
      </Fold>

      <div className="year-boxes">
        {report.years.map((year) => {
          const open = openYear === year.year
          return (
            <button
              key={year.year}
              type="button"
              className={open ? 'year-box on' : 'year-box'}
              aria-expanded={open}
              onClick={() => setOpenYear(open ? null : year.year)}
            >
              <strong>{year.year}</strong>
              <em>{year.age}</em>
              <small>{year.count}</small>
            </button>
          )
        })}
      </div>
      {openYear != null && (
        <div className="ledgers">
          {rows
            .filter((row) => row.note.year === openYear)
            .map((row) => (
              <Person key={row.key} person={row.note} onEdit={() => setEditing(row)} />
            ))}
        </div>
      )}
      {editing && (
        <EditNote
          note={editing.note}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            if (editing.extraIndex != null) {
              const copy = extra.map((item, index) => (index === editing.extraIndex ? next : item))
              setExtra(copy)
              saveExtra(copy)
            } else {
              saveOverride(editing.key, next)
              setOverrides(loadOverrides())
            }
            setEditing(null)
            setOpenYear(next.year)
          }}
        />
      )}
    </div>
      </main>
    </>
  )
}

function AddWoman({ onAdd }: { onAdd: (note: Note) => void }) {
  const [name, setName] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [recurrent, setRecurrent] = useState(false)
  const [times, setTimes] = useState(1)
  const age = year - 1990

  return (
    <form
      className="quiet-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim() || !Number.isFinite(year)) return
        onAdd({
          name: name.trim(),
          year,
          age,
          count: recurrent ? null : Math.max(1, times),
          mark: recurrent,
        })
      }}
    >
      <input value={name} autoFocus placeholder="Nombre" aria-label="Nombre" onChange={(event) => setName(event.target.value)} />
      <div className="quiet-meta">
        <input
          type="number"
          inputMode="numeric"
          aria-label="Año"
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
        />
        <span className="age-note">{Number.isFinite(age) ? age : ''}</span>
      </div>
      <div className="quiet-switch">
        <button type="button" className={recurrent ? 'on' : ''} onClick={() => setRecurrent(true)}>
          Recurrente
        </button>
        <button type="button" className={recurrent ? '' : 'on'} onClick={() => setRecurrent(false)}>
          Veces
        </button>
        {!recurrent && (
          <input
            type="number"
            inputMode="numeric"
            min={1}
            aria-label="Veces"
            value={times}
            onChange={(event) => setTimes(Math.max(1, Number(event.target.value) || 1))}
          />
        )}
      </div>
      <button className="quiet-save" type="submit" disabled={!name.trim()}>
        Agregar
      </button>
    </form>
  )
}

function Person({ person, onEdit }: { person: Note; onEdit: () => void }) {
  return (
    <article className="person">
      <div>
        <strong>{person.name}</strong>
        <em>{person.age}</em>
      </div>
      {person.count != null ? <span>{person.count}</span> : <b>Recurrente</b>}
      <button type="button" className="item-edit" onClick={onEdit}>
        Editar
      </button>
    </article>
  )
}

function EditNote({ note, onClose, onSave }: { note: Note; onClose: () => void; onSave: (note: Note) => void }) {
  const [name, setName] = useState(note.name)
  const [year, setYear] = useState(note.year)
  const [recurrent, setRecurrent] = useState(note.mark || note.count == null)
  const [times, setTimes] = useState(note.count ?? 1)
  const age = year - 1990

  return (
    <div className="sheet-back" onClick={onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-label="Editar registro"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (!name.trim() || !Number.isFinite(year)) return
          onSave({
            name: name.trim(),
            year,
            age,
            count: recurrent ? null : Math.max(1, times),
            mark: recurrent,
          })
        }}
      >
        <div className="sheet-handle" />
        <div className="sheet-title">
          <h2>Editar</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <label className="field">
          Nombre
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          Año
          <input type="number" inputMode="numeric" value={year} onChange={(event) => setYear(Number(event.target.value))} />
        </label>
        <div className="quiet-switch">
          <button type="button" className={recurrent ? 'on' : ''} onClick={() => setRecurrent(true)}>
            Recurrente
          </button>
          <button type="button" className={recurrent ? '' : 'on'} onClick={() => setRecurrent(false)}>
            Veces
          </button>
          {!recurrent && (
            <input type="number" inputMode="numeric" min={1} aria-label="Veces" value={times} onChange={(event) => setTimes(Math.max(1, Number(event.target.value) || 1))} />
          )}
        </div>
        <button className="btn primary" type="submit" disabled={!name.trim()}>
          Guardar
        </button>
      </form>
    </div>
  )
}

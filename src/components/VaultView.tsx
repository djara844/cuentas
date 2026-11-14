import { useMemo, useState, type FormEvent } from 'react'
import { go } from '../route'
import { NOTES, confirmGate, loadExtra, noteReport, saveExtra, type Note } from '../vault'

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
  const [adding, setAdding] = useState(false)
  const notes = useMemo(() => [...NOTES, ...extra], [extra])
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

      <section className="panel">
        <div className="panel-top">
          <h2>Por año</h2>
        </div>
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
      </section>

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
          {notes.filter((item) => item.year === openYear).map((person, index) => (
            <Person key={`${person.year}-${person.name}-${index}`} person={person} />
          ))}
        </div>
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

function Person({ person }: { person: Note }) {
  return (
    <article className="person">
      <div>
        <strong>{person.name}</strong>
        <em>{person.age}</em>
      </div>
      {person.count != null ? <span>{person.count}</span> : <b>Recurrente</b>}
    </article>
  )
}

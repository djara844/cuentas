import { useMemo, useState } from 'react'
import { go, goPeriod } from '../route'
import { useBoard } from '../tasks'
import { useStore } from '../store'
import { MONTHS } from '../types'
import { formatCOP } from '../money'
import { colombianHolidays } from '../colombia'

const FESTIVO = '#e7c27a'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function CalendarView() {
  const today = new Date()
  const board = useBoard()
  const store = useStore()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [selected, setSelected] = useState<string | null>(iso(today))

  const dated = useMemo(
    () => board.cards.filter((card) => card.due && card.due.startsWith(`${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`)),
    [board.cards, cursor.month, cursor.year],
  )

  const byDay = useMemo(() => {
    const map = new Map<string, typeof dated>()
    for (const card of dated) {
      if (!card.due) continue
      map.set(card.due, [...(map.get(card.due) ?? []), card])
    }
    return map
  }, [dated])

  const payments = useMemo(() => {
    const period = store.db.periods.find((item) => item.year === cursor.year && item.coveredMonth === cursor.month)
    if (!period) return []
    const last = new Date(cursor.year, cursor.month + 1, 0).getDate()
    return store.db.entries
      .filter((entry) => entry.periodId === period.id && entry.kind !== 'ingreso' && entry.dueDay)
      .map((entry) => ({
        entry,
        day: Math.min(entry.dueDay ?? 1, last),
        color: store.db.categories.find((category) => category.id === entry.categoryId)?.color ?? '#d0d0d0',
      }))
      .sort((a, b) => a.day - b.day || a.entry.description.localeCompare(b.entry.description, 'es'))
  }, [store.db, cursor.month, cursor.year])

  const days = useMemo(() => buildMonth(cursor.year, cursor.month), [cursor.month, cursor.year])
  const holidays = useMemo(() => new Set(colombianHolidays(cursor.year).filter((holiday) => holiday.month === cursor.month).map((holiday) => holiday.day)), [cursor.month, cursor.year])
  const dayCards = selected ? (byDay.get(selected) ?? []) : dated

  function shift(delta: number) {
    const next = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: next.getFullYear(), month: next.getMonth() })
    setSelected(null)
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
          <span>Calendario</span>
          <small>
            {payments.length} pagos · {dated.length} pendientes
          </small>
        </div>
      </header>
      <main className="main">
        <div className="cal-head">
          <button className="icon-btn" aria-label="Mes anterior" onClick={() => shift(-1)}>
            ‹
          </button>
          <strong>
            {MONTHS[cursor.month]} {cursor.year}
          </strong>
          <button className="icon-btn" aria-label="Mes siguiente" onClick={() => shift(1)}>
            ›
          </button>
        </div>
        <div className="weekdays" aria-hidden="true">
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="month">
          {days.map((day, index) => {
            if (!day) return <span key={`empty-${index}`} />
            const key = iso(day)
            const cards = byDay.get(key) ?? []
            const dues = payments.filter((item) => item.day === day.getDate())
            const isToday = sameDay(day, today)
            const festivo = holidays.has(day.getDate())
            return (
              <button
                key={key}
                className={['day', selected === key ? 'on' : '', isToday ? 'today' : '', festivo ? 'festivo' : ''].filter(Boolean).join(' ')}
                onClick={() => setSelected(selected === key ? null : key)}
              >
                {day.getDate()}
                <span className="dots">
                  {festivo && <i style={{ background: FESTIVO }} />}
                  {dues.slice(0, 3).map((item) => (
                    <i key={item.entry.id} style={{ background: item.color }} />
                  ))}
                  {cards.slice(0, Math.max(0, 3 - dues.length)).map((card) => {
                    const color = board.categories.find((category) => category.id === card.categoryId)?.color ?? '#f472b6'
                    return <i key={card.id} style={{ background: color }} />
                  })}
                </span>
              </button>
            )
          })}
        </div>

        <section className="day-list">
          <h2>{selected ? `Pagos del ${labelDay(selected)}` : 'Pagos del mes'}</h2>
          {(selected ? payments.filter((item) => iso(new Date(cursor.year, cursor.month, item.day)) === selected) : payments).length === 0 && (
            <p className="empty wide">No hay pagos con fecha{selected ? ' este día' : ' este mes'}.</p>
          )}
          {(selected ? payments.filter((item) => iso(new Date(cursor.year, cursor.month, item.day)) === selected) : payments).map((item) => (
            <article key={item.entry.id} className={item.entry.paid ? 'is-paid' : ''} style={{ ['--card-color' as string]: item.color }}>
              <button type="button" onClick={() => goPeriod(item.entry.periodId)}>
                <strong>{item.entry.description || 'Pago'}</strong>
                <small>
                  Día {item.day}
                  {item.entry.termTotal ? ` · ${item.entry.termIndex}/${item.entry.termTotal}` : ''}
                  {' · '}
                  {formatCOP(item.entry.amount)}
                  {item.entry.paid ? ' · pagado' : ''}
                </small>
              </button>
            </article>
          ))}
          <h2>{selected ? `Pendientes del ${labelDay(selected)}` : 'Pendientes del mes'}</h2>
          {dayCards.length === 0 && <p className="empty wide">No hay pendientes con fecha{selected ? ' este día' : ' este mes'}.</p>}
          {dayCards.map((card) => {
            const category = board.categories.find((item) => item.id === card.categoryId)
            const column = board.columns.find((item) => item.id === card.columnId)
            return (
              <article key={card.id} style={{ ['--card-color' as string]: category?.color ?? '#f472b6' }}>
                <strong>{card.title || 'Sin título'}</strong>
                <small>
                  {column?.name ?? 'Pendiente'}
                  {category ? ` · ${category.name}` : ''}
                  {card.due ? ` · ${labelDay(card.due)}` : ''}
                </small>
              </article>
            )
          })}
        </section>
      </main>
    </>
  )
}

function buildMonth(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1)
  const pad = (first.getDay() + 6) % 7
  const count = new Date(year, month + 1, 0).getDate()
  const cells: Array<Date | null> = Array.from({ length: pad }, () => null)
  for (let day = 1; day <= count; day++) cells.push(new Date(year, month, day))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function labelDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Date(year, month - 1, day).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })
}

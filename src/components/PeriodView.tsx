import type { Kind, Period } from '../types'
import { MONTHS, categoriesOf, periodStats } from '../types'
import { formatCOP } from '../money'
import { monthCalendar } from '../colombia'
import { useStore } from '../store'
import { Ledger } from './Ledger'

export function PeriodView({ period }: { period: Period }) {
  const store = useStore()
  const stats = periodStats(store.db, period.id)
  const calendar = monthCalendar(period.year, period.coveredMonth)
  const month = MONTHS[period.coveredMonth]

  function addFixed(kind: Kind) {
    const category = categoriesOf(store.db, kind)[0]
    const created = store.addTemplate({
      kind,
      description: '',
      amount: 0,
      categoryId: category?.id ?? null,
    })
    return created.entries.find((entry) => entry.periodId === period.id)?.id ?? ''
  }

  return (
    <div className="wrap">
      <header className="period-card">
        <div>
          <p className="kicker">{period.year}</p>
          <h1 className="period-title">{month}</h1>
          <p className="cal-range">1 – {calendar.days} de {month.toLowerCase()}</p>
        </div>
        <p className="month-note">
          <span><b>{calendar.businessDays}</b> días hábiles</span>
          <span><b>{calendar.holidays.length}</b> festivos</span>
        </p>
        {calendar.holidays.length > 0 ? (
          <ul className="cal-holidays">
            {calendar.holidays.map((holiday) => (
              <li key={holiday.name}>
                <span>{holiday.day}</span>
                {holiday.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="cal-range">Sin festivos</p>
        )}
      </header>

      <section className="stats" aria-label="Resumen del periodo">
        <article className="stat">
          <span>Ingresos</span>
          <strong>{formatCOP(stats.ingresos)}</strong>
        </article>
        <article className="stat">
          <span>Gastos</span>
          <strong>{formatCOP(stats.gastos)}</strong>
        </article>
        <article className={stats.libre < 0 ? 'stat libre neg' : 'stat libre pos'}>
          <span>Libre</span>
          <strong>{formatCOP(stats.libre)}</strong>
        </article>
      </section>

      <div className="ledgers">
        <Ledger
          title="Ingresos"
          entries={store.db.entries.filter((e) => e.periodId === period.id && e.kind === 'ingreso').sort((a, b) => a.sortOrder - b.sortOrder)}
          categories={categoriesOf(store.db, 'ingreso')}
          total={stats.ingresos}
          onAdd={() => store.addEntry({ periodId: period.id, kind: 'ingreso', categoryId: categoriesOf(store.db, 'ingreso')[0]?.id ?? null }).id}
          onAddFixed={() => addFixed('ingreso')}
          onAddTerm={(input) => store.addTerm({ ...input, periodId: period.id, kind: 'ingreso' })}
          onCreateCategory={(name) => store.addCategory({ name, kind: 'ingreso', color: '#1f7a45' })}
          onChange={(id, patch) => store.updateEntry(id, patch)}
          onDelete={(id) => store.removeEntry(id)}
        />
        <Ledger
          title="Gastos"
          entries={store.db.entries.filter((e) => e.periodId === period.id && e.kind === 'gasto').sort((a, b) => a.sortOrder - b.sortOrder)}
          categories={categoriesOf(store.db, 'gasto')}
          total={stats.gastos}
          onAdd={() => store.addEntry({ periodId: period.id, kind: 'gasto', categoryId: categoriesOf(store.db, 'gasto')[0]?.id ?? null }).id}
          onAddFixed={() => addFixed('gasto')}
          onCreateCategory={(name) => store.addCategory({ name, kind: 'gasto', color: '#9a3412' })}
          payable
          dated
          onAddTerm={(input) => store.addTerm({ ...input, periodId: period.id, kind: 'gasto' })}
          onChange={(id, patch) => store.updateEntry(id, patch)}
          onDelete={(id) => store.removeEntry(id)}
        />
      </div>
    </div>
  )
}

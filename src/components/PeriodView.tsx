import type { Kind, Period } from '../types'
import { MONTHS, categoriesOf, periodStats } from '../types'
import { formatCOP } from '../money'
import { monthCalendar } from '../colombia'
import { useStore } from '../store'
import { Ledger, type ItemInput } from './Ledger'
import { Fold } from './Fold'

export function PeriodView({ period }: { period: Period }) {
  const store = useStore()
  const stats = periodStats(store.db, period.id)
  const debtMonth = store.db.entries
    .filter((entry) => entry.periodId === period.id && entry.debtId && entry.kind === 'gasto' && entry.paid)
    .reduce((sum, entry) => sum + entry.amount, 0)
  const calendar = monthCalendar(period.year, period.coveredMonth)
  const month = MONTHS[period.coveredMonth]

  function saveEntry(id: string, patch: Parameters<typeof store.updateEntry>[1]) {
    const entry = store.db.entries.find((item) => item.id === id)
    if (entry?.templateId && (patch.description !== undefined || patch.categoryId !== undefined)) {
      store.updateTemplate(entry.templateId, {
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
      })
    }
    store.updateEntry(id, patch)
  }

  function addVariable(kind: Kind, input: ItemInput) {
    if (input.debtId) {
      store.addDebtAdvance({
        periodId: period.id,
        debtId: input.debtId,
        description: input.description,
        categoryId: input.categoryId,
        amount: input.amount,
        paid: input.paid,
        dueDay: input.dueDay,
      })
      return
    }
    const entry = store.addEntry({
      periodId: period.id,
      kind,
      description: input.description,
      categoryId: input.categoryId,
      amount: input.amount,
    })
    if (input.paid || input.dueDay != null) store.updateEntry(entry.id, { paid: input.paid, dueDay: input.dueDay })
  }

  function addFixed(kind: Kind, input: ItemInput) {
    const created = store.addTemplate({
      kind,
      description: input.description,
      amount: input.amount,
      categoryId: input.categoryId,
    })
    const entry = created.entries.find((item) => item.periodId === period.id)
    if (entry && (input.paid || input.dueDay != null)) store.updateEntry(entry.id, { paid: input.paid, dueDay: input.dueDay })
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
          <Fold title="Festivos" meta={calendar.holidays.length}>
            <ul className="cal-holidays">
              {calendar.holidays.map((holiday) => (
                <li key={holiday.name}>
                  <span>{holiday.day}</span>
                  {holiday.name}
                </li>
              ))}
            </ul>
          </Fold>
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
          {debtMonth > 0 && <em className="stat-debt">deuda {formatCOP(debtMonth)}</em>}
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
          onAdd={(input) => addVariable('ingreso', input)}
          onAddFixed={(input) => addFixed('ingreso', input)}
          onCreateCategory={(name) => store.addCategory({ name, kind: 'ingreso', color: '#1f7a45' })}
          onChange={saveEntry}
          onDelete={(id) => store.removeEntry(id)}
        />
        <Ledger
          title="Gastos"
          entries={store.db.entries.filter((e) => e.periodId === period.id && e.kind === 'gasto').sort((a, b) => a.sortOrder - b.sortOrder)}
          categories={categoriesOf(store.db, 'gasto')}
          total={stats.gastos}
          onAdd={(input) => addVariable('gasto', input)}
          onAddFixed={(input) => addFixed('gasto', input)}
          onCreateCategory={(name) => store.addCategory({ name, kind: 'gasto', color: '#9a3412' })}
          payable
          dated
          debts={(store.db.debts ?? []).map((debt) => ({ id: debt.id, name: debt.name, categoryId: debt.categoryId }))}
          onChange={saveEntry}
          onDelete={(id) => store.removeEntry(id)}
        />
      </div>
    </div>
  )
}

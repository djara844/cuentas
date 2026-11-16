import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { MONTHS, categoriesOf, debtApplied, planDebt, planSpan, type Entry, type Period } from '../types'
import { formatCOP, parseCOP } from '../money'
import { useStore } from '../store'
import { Fold } from './Fold'

export function DebtsPanel({ period, manage = false, nested = false, bare = false }: { period: Period; manage?: boolean; nested?: boolean; bare?: boolean }) {
  const store = useStore()
  const [open, setOpen] = useState(bare)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [configuring, setConfiguring] = useState<string | null>(null)
  const debts = store.db.debts ?? []
  const categories = categoriesOf(store.db, 'gasto')
  const monthDue = debts.reduce((sum, debt) => {
    const cuota = debtApplied(store.db, debt.id).cuotas.find((entry) => entry.periodId === period.id)
    return sum + (cuota?.amount ?? 0)
  }, 0)

  return (
    <section className={bare ? 'debts is-bare' : nested ? 'debts is-nested' : 'debts'} aria-label="Deudas">
      {!bare && (
        <header className="debts-head">
          <button className="ledger-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
            <i className={open ? 'chev' : 'chev shut'} aria-hidden="true" />
            <h2>Deudas</h2>
            {monthDue > 0 && <strong>{formatCOP(monthDue)}</strong>}
          </button>
        </header>
      )}
      {manage && open && (
        <button type="button" className="debt-new" onClick={() => setCreating(true)}>
          Nueva deuda
        </button>
      )}
      {open && debts.length === 0 && <p className="empty">Sin deudas.</p>}
      {open &&
        debts.map((debt) => {
          const progress = debtApplied(store.db, debt.id)
          const category = categories.find((item) => item.id === debt.categoryId)
          const ordered = [...progress.cuotas].sort((a, b) => (a.termIndex ?? 0) - (b.termIndex ?? 0))
          const monthOf = (entry: Entry) => store.db.periods.find((periodItem) => periodItem.id === entry.periodId)?.sortOrder ?? Number.MAX_SAFE_INTEGER
          const payments = [...progress.cuotas, ...progress.avances].sort((a, b) => {
            const order = monthOf(a) - monthOf(b)
            if (order !== 0) return order
            return (a.dueDay ?? 0) - (b.dueDay ?? 0) || (a.termIndex ?? 0) - (b.termIndex ?? 0)
          })
          const remaining = Math.max(0, debt.total - progress.paid)
          const editingCuota = ordered.find((entry) => entry.id === editing)
          const startPeriod = store.db.periods.find((item) => item.year === debt.startYear && item.coveredMonth === debt.startMonth)
          return (
            <div key={debt.id} className="debt-block">
              <div className="debt-sum">
                <div>
                  {category && <em className="tag" style={{ ['--tag' as string]: category.color }}>{category.name}</em>}
                  <strong>{debt.name}</strong>
                  <small>Restan {formatCOP(remaining)}</small>
                </div>
                <div className="debt-sum-side">
                  <b>{formatCOP(debt.total)}</b>
                  <button type="button" className="item-edit" onClick={() => setConfiguring(debt.id)}>
                    Editar
                  </button>
                </div>
              </div>
              <Fold title="Pagos" meta={payments.length}>
                <div className="debt-cuotas">
                  {payments.map((cuota) => {
                    const item = store.db.periods.find((periodItem) => periodItem.id === cuota.periodId)
                    const label = item ? `${MONTHS[item.coveredMonth]} ${item.year}` : 'Pago'
                    return (
                      <div key={cuota.id} className={cuota.paid ? 'debt-cuota is-paid' : 'debt-cuota'}>
                        <span>
                          {cuota.advance ? cuota.description.trim() || debt.name : label}
                          {cuota.advance && <small>{label}</small>}
                        </span>
                        <b>{formatCOP(cuota.amount)}</b>
                        <div className="debt-cuota-actions">
                          <button
                            type="button"
                            className={cuota.paid ? 'pay-chip on' : 'pay-chip'}
                            aria-pressed={Boolean(cuota.paid)}
                            onClick={() => store.updateEntry(cuota.id, { paid: !cuota.paid })}
                          >
                            {cuota.paid ? 'Pagado' : 'Pagar'}
                          </button>
                          {!cuota.advance && (
                            <button type="button" className="item-edit" onClick={() => setEditing(editing === cuota.id ? null : cuota.id)}>
                              Editar
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {editingCuota && (
                  <PaymentForm
                    amount={editingCuota.amount}
                    cuotas={ordered}
                    cuotaId={editingCuota.id}
                    total={debt.total}
                    advances={progress.avances.reduce((sum, entry) => sum + entry.amount, 0)}
                    onClose={() => setEditing(null)}
                    onSave={(next) => {
                      store.setDebtPayment(debt.id, editingCuota.periodId, next)
                      setEditing(null)
                    }}
                  />
                )}
              </Fold>
              {configuring === debt.id && (
                <DebtForm
                  title="Editar deuda"
                  periods={[...store.db.periods].sort((a, b) => a.sortOrder - b.sortOrder)}
                  startId={startPeriod?.id ?? period.id}
                  categories={categories}
                  initial={{ name: debt.name, total: debt.total, cuota: debt.cuota, categoryId: debt.categoryId }}
                  initialMonths={debtMonths(debt, store.db.periods, store.db.entries)}
                  paidMonths={ordered
                    .filter((entry) => entry.paid)
                    .map((entry) => {
                      const item = store.db.periods.find((periodItem) => periodItem.id === entry.periodId)
                      return item ? { year: item.year, month: item.coveredMonth, amount: entry.amount } : null
                    })
                    .filter((item): item is { year: number; month: number; amount: number } => item != null)}
                  paidExtra={progress.avances.reduce((sum, entry) => sum + entry.amount, 0)}
                  onClose={() => setConfiguring(null)}
                  onSave={(input) => {
                    store.updateDebt(debt.id, input)
                    setConfiguring(null)
                  }}
                />
              )}
            </div>
          )
        })}
      {creating && (
        <DebtForm
          title="Nueva deuda"
          periods={[...store.db.periods].sort((a, b) => a.sortOrder - b.sortOrder)}
          startId={period.id}
          categories={categories}
          onClose={() => setCreating(false)}
          onSave={(input) => {
            store.addDebt(input)
            setCreating(false)
            setOpen(true)
          }}
        />
      )}
    </section>
  )
}

function previewLast(cuotas: Entry[], cuotaId: string, amount: number, target: number) {
  const ordered = [...cuotas].sort((a, b) => (a.termIndex ?? 0) - (b.termIndex ?? 0))
  const index = ordered.findIndex((entry) => entry.id === cuotaId)
  if (index < 0) return 0
  const amounts = ordered.map((entry) => entry.amount)
  amounts[index] = Math.max(0, Math.round(amount))
  let delta = amounts.reduce((sum, value) => sum + value, 0) - target
  if (delta > 0) {
    for (let cursor = amounts.length - 1; cursor >= 0 && delta > 0; cursor -= 1) {
      if (cursor === index) continue
      const cut = Math.min(amounts[cursor], delta)
      amounts[cursor] -= cut
      delta -= cut
    }
  } else if (delta < 0) {
    if (index !== amounts.length - 1) amounts[amounts.length - 1] += -delta
    else return -delta
  }
  for (let cursor = amounts.length - 1; cursor >= 0; cursor -= 1) {
    if (cursor !== index && amounts[cursor] > 0) return amounts[cursor]
  }
  return 0
}

function PaymentForm({
  amount,
  cuotas,
  cuotaId,
  total,
  advances,
  onClose,
  onSave,
}: {
  amount: number
  cuotas: Entry[]
  cuotaId: string
  total: number
  advances: number
  onClose: () => void
  onSave: (amount: number) => void
}) {
  const [text, setText] = useState(String(amount))
  const next = parseCOP(text)
  const last = previewLast(cuotas, cuotaId, next, Math.max(0, total - advances))
  return (
    <form
      className="debt-pay"
      onSubmit={(event) => {
        event.preventDefault()
        if (next < 0) return
        onSave(next)
      }}
    >
      <label className="field">
        Cuánto pagas
        <input inputMode="numeric" autoFocus value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <p className="debt-note">La última cuota queda en {formatCOP(last)}.</p>
      <div className="head-actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn primary" type="submit">
          Guardar
        </button>
      </div>
    </form>
  )
}

function debtMonths(debt: { id: string; months?: number | null; startYear: number; startMonth: number }, periods: Period[], entries: Entry[]) {
  if (typeof debt.months === 'number' && debt.months > 0) return debt.months
  const start = debt.startYear * 12 + debt.startMonth
  let last = start
  for (const entry of entries) {
    if (entry.debtId !== debt.id || entry.advance) continue
    const period = periods.find((item) => item.id === entry.periodId)
    if (!period) continue
    last = Math.max(last, period.year * 12 + period.coveredMonth)
  }
  return Math.max(1, last - start + 1)
}

function DebtForm({
  title,
  periods,
  startId,
  categories,
  initial,
  initialMonths,
  paidMonths = [],
  paidExtra = 0,
  onClose,
  onSave,
}: {
  title: string
  periods: Period[]
  startId: string
  categories: { id: string; name: string }[]
  initial?: { name: string; total: number; cuota: number; categoryId: string | null }
  initialMonths?: number
  paidMonths?: { year: number; month: number; amount: number }[]
  paidExtra?: number
  onClose: () => void
  onSave: (input: { name: string; total: number; cuota: number; categoryId: string | null; startPeriodId: string; months: number }) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [totalText, setTotalText] = useState(initial ? String(initial.total) : '')
  const [cuotaText, setCuotaText] = useState(initial ? String(initial.cuota) : '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [startPeriodId, setStartPeriodId] = useState(startId)
  const [months, setMonths] = useState(initialMonths ?? 0)
  const total = parseCOP(totalText)
  const cuota = parseCOP(cuotaText)
  const plan = planDebt(total, cuota)
  const count = Math.max(1, Math.min(36, months > 0 ? months : plan.length || 1))
  const start = periods.find((period) => period.id === startPeriodId)
  const settled = paidMonths.reduce((sum, item) => sum + item.amount, 0) + paidExtra
  const origin = start ? new Date(start.year, start.coveredMonth, 1) : null
  const slots = origin ? Array.from({ length: count }, (_, index) => new Date(origin.getFullYear(), origin.getMonth() + index, 1)) : []
  const paidByKey = new Map(paidMonths.map((item) => [`${item.year}-${item.month}`, item.amount]))
  const outside = paidMonths.filter((item) => !slots.some((date) => date.getFullYear() === item.year && date.getMonth() === item.month))
  const openSlots = slots.filter((date) => !paidByKey.has(`${date.getFullYear()}-${date.getMonth()}`))
  const pendingAmounts = planSpan(Math.max(0, total - settled), cuota, openSlots.length || 1).slice(0, openSlots.length)

  function save(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || total <= 0 || cuota <= 0 || !categoryId || !start) return
    onSave({ name: name.trim(), total, cuota, categoryId, startPeriodId, months: count })
  }

  return createPortal(
    <div className="sheet-back" onClick={onClose}>
      <form className="sheet" role="dialog" aria-label={title} onClick={(event) => event.stopPropagation()} onSubmit={save}>
        <div className="sheet-handle" />
        <div className="sheet-title">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <label className="field">
          Nombre
          <input autoFocus value={name} placeholder="Japan" onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          Categoría
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Valor total
          <input inputMode="numeric" placeholder="$0" value={totalText} onChange={(event) => setTotalText(event.target.value)} />
        </label>
        <label className="field">
          Cuota mensual
          <input inputMode="numeric" placeholder="$0" value={cuotaText} onChange={(event) => setCuotaText(event.target.value)} />
        </label>
        <div className="span-row">
          <label className="field">
            Desde
            <select value={startPeriodId} onChange={(event) => setStartPeriodId(event.target.value)}>
              {periods.map((item) => (
                <option key={item.id} value={item.id}>
                  {MONTHS[item.coveredMonth]} {item.year}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Meses
            <input
              type="number"
              min={1}
              max={36}
              inputMode="numeric"
              value={count}
              onChange={(event) => setMonths(Math.max(1, Math.min(36, Number(event.target.value) || 1)))}
            />
          </label>
        </div>
        {(outside.length > 0 || slots.length > 0) && (
          <div className="debt-cuotas">
            {outside.map((item) => (
              <div key={`paid-${item.year}-${item.month}`} className="debt-cuota is-paid">
                <span>
                  {MONTHS[item.month]} {item.year}
                </span>
                <b>{formatCOP(item.amount)}</b>
              </div>
            ))}
            {slots.flatMap((date) => {
              const key = `${date.getFullYear()}-${date.getMonth()}`
              const paid = paidByKey.get(key)
              const amount = paid ?? pendingAmounts[openSlots.findIndex((item) => item.getFullYear() === date.getFullYear() && item.getMonth() === date.getMonth())]
              if (amount == null || Number.isNaN(amount)) return []
              return [(
                <div key={key} className={paid != null ? 'debt-cuota is-paid' : 'debt-cuota'}>
                  <span>
                    {MONTHS[date.getMonth()]} {date.getFullYear()}
                  </span>
                  <b>{formatCOP(amount)}</b>
                </div>
              )]
            })}
          </div>
        )}
        <button className="btn primary" type="submit" disabled={!name.trim() || total <= 0 || cuota <= 0 || !categoryId}>
          Guardar
        </button>
      </form>
    </div>,
    document.body,
  )
}

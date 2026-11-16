import { useState } from 'react'
import type { Entry, Kind, Period, Template } from '../types'
import { KINDS, MONTHS, categoriesOf, templatesOf } from '../types'
import { useStore } from '../store'
import { MoneyField } from './Fields'

export function RecurrentesView() {
  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <p className="kicker">Cuentas</p>
          <h1 className="page-title">Fijos</h1>
          <p className="formula">Estos ítems entran en todos los meses.</p>
        </div>
      </header>
      <div className="cat-board">
        {KINDS.map((kind) => (
          <TemplateColumn key={`${kind.id}-cerrado`} kind={kind.id} label={kind.label} />
        ))}
      </div>
    </div>
  )
}

function TemplateColumn({ kind, label }: { kind: Kind; label: string }) {
  const store = useStore()
  const templates = templatesOf(store.db, kind)
  const categories = categoriesOf(store.db, kind)
  const periods = [...store.db.periods].sort((a, b) => a.sortOrder - b.sortOrder)
  const today = new Date()
  const todayPeriod = periods.find((period) => period.year === today.getFullYear() && period.coveredMonth === today.getMonth()) ?? periods[0]
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(0)
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [startId, setStartId] = useState(todayPeriod?.id ?? '')
  const [months, setMonths] = useState(12)

  function toggle() {
    setOpen((current) => !current)
  }

  return (
    <section className={open ? 'cat-col' : 'cat-col is-closed'} aria-label={label}>
      <header className="ledger-head">
        <button className="ledger-toggle" aria-expanded={open} onClick={toggle}>
          <i className={open ? 'chev' : 'chev shut'} aria-hidden="true" />
          <h2>{label}</h2>
          <span>{templates.length}</span>
        </button>
      </header>
      {open && (
        <ul className="cat-list">
          {templates.map((template) => {
            const category = categories.find((item) => item.id === template.categoryId)
            const itemName = template.description
            return (
              <li key={template.id} className="recur-item">
                <div className="recur-name">
                  <input
                    value={itemName}
                    placeholder="Ítem"
                    aria-label={`Ítem ${itemName || category?.name || ''}`}
                    onChange={(event) => store.updateTemplate(template.id, { description: event.target.value })}
                  />
                  <MoneyField value={template.amount} onCommit={(next) => store.updateTemplate(template.id, { amount: next })} />
                </div>
                <select
                  aria-label={`Categoría de ${itemName || 'este ítem'}`}
                  value={template.categoryId ?? ''}
                  onChange={(event) => store.updateTemplate(template.id, { categoryId: event.target.value || null })}
                >
                  {!template.categoryId && <option value="">Categoría</option>}
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {kind === 'gasto' && (
                  <TemplateSpan
                    periods={periods}
                    startId={templateSpan(template, periods, store.db.entries).startId}
                    months={templateSpan(template, periods, store.db.entries).months}
                    onChange={(nextStart, nextMonths) => {
                      const period = periods.find((item) => item.id === nextStart)
                      if (!period) return
                      store.updateTemplate(template.id, { startYear: period.year, startMonth: period.coveredMonth, months: nextMonths })
                    }}
                  />
                )}
                <div className="recur-actions">
                  <button type="button" className="btn" onClick={() => store.applyTemplateAmount(template.id)}>
                    Poner este valor en todos
                  </button>
                  <button
                    type="button"
                    className="del on"
                    aria-label={`Quitar ${template.description}`}
                    onClick={() => {
                      if (confirm(`¿Quitar “${template.description}” de todos los meses?`)) store.removeTemplate(template.id)
                    }}
                  >
                    ×
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {open &&
        (creating ? (
          <form
            className="cat-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (!name.trim() || !categoryId) return
              store.addTemplate({
                kind,
                description: name.trim(),
                amount,
                categoryId,
                ...(kind === 'gasto' && startId
                  ? {
                      startYear: periods.find((period) => period.id === startId)?.year,
                      startMonth: periods.find((period) => period.id === startId)?.coveredMonth,
                      months,
                    }
                  : {}),
              })
              setName('')
              setAmount(0)
              setCreating(false)
            }}
          >
            <div className="recur-name">
              <input value={name} autoFocus placeholder="Ítem" aria-label={`Nuevo ítem de ${label}`} onChange={(event) => setName(event.target.value)} />
              <MoneyField value={amount} onCommit={setAmount} />
            </div>
            <select aria-label="Categoría" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
              {!categoryId && <option value="">Categoría</option>}
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {kind === 'gasto' && (
              <TemplateSpan
                periods={periods}
                startId={startId}
                months={months}
                onChange={(nextStart, nextMonths) => {
                  setStartId(nextStart)
                  setMonths(nextMonths)
                }}
              />
            )}
            <div className="form-actions">
              <button className="btn" type="button" onClick={() => setCreating(false)}>
                Cancelar
              </button>
              <button className="btn primary" type="submit">
                {kind === 'gasto' ? 'Agregar' : 'Agregar a todos los meses'}
              </button>
            </div>
          </form>
        ) : (
          <button className="add-row" onClick={() => setCreating(true)}>
            + Agregar fijo
          </button>
        ))}
    </section>
  )
}

function templateSpan(template: Template, periods: Period[], entries: Entry[]) {
  if (template.startYear != null && template.startMonth != null && template.months) {
    const start = periods.find((period) => period.year === template.startYear && period.coveredMonth === template.startMonth) ?? periods[0]
    return { startId: start?.id ?? '', months: template.months }
  }
  const linked = entries
    .filter((entry) => entry.templateId === template.id)
    .map((entry) => periods.find((period) => period.id === entry.periodId))
    .filter((period): period is Period => Boolean(period))
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const start = linked[0] ?? periods[0]
  const end = linked[linked.length - 1] ?? periods[periods.length - 1]
  const months = start && end ? Math.max(1, end.year * 12 + end.coveredMonth - (start.year * 12 + start.coveredMonth) + 1) : 1
  return { startId: start?.id ?? '', months }
}

function TemplateSpan({
  periods,
  startId,
  months,
  onChange,
}: {
  periods: Period[]
  startId: string
  months: number
  onChange: (startId: string, months: number) => void
}) {
  const selected = periods.find((period) => period.id === startId) ?? periods[0]
  return (
    <div className="span-row">
      <label className="field">
        Desde
        <select aria-label="Desde" value={selected?.id ?? ''} onChange={(event) => onChange(event.target.value, months)}>
          {periods.map((period) => (
            <option key={period.id} value={period.id}>
              {MONTHS[period.coveredMonth]} {period.year}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Meses
        <input
          aria-label="Meses"
          type="number"
          min={1}
          max={36}
          inputMode="numeric"
          value={months}
          onChange={(event) => onChange(selected?.id ?? '', Math.max(1, Math.min(36, Number(event.target.value) || 1)))}
        />
      </label>
    </div>
  )
}

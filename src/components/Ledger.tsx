import { useEffect, useState } from 'react'
import type { Category, Entry } from '../types'
import { formatCOP, parseCOP } from '../money'
import { MoneyField } from './Fields'

const SWATCHES = ['#38bdf8', '#22d3ee', '#818cf8', '#c084fc', '#f472b6', '#fb7185', '#fb923c', '#fbbf24', '#2dd4bf', '#60a5fa', '#a78bfa', '#94a3b8']

export function Ledger({
  title,
  entries,
  categories,
  total,
  onAdd,
  onAddFixed,
  onAddTerm,
  onCreateCategory,
  onChange,
  onDelete,
  payable = false,
  dated = false,
}: {
  title: string
  entries: Entry[]
  categories: Category[]
  total: number
  onAdd: () => string
  onAddFixed: () => string
  onAddTerm?: (input: { description: string; categoryId: string | null; amount: number; startDate: string; months: number }) => string
  onCreateCategory: (name: string) => Category
  onChange: (id: string, patch: Partial<Pick<Entry, 'description' | 'amount' | 'categoryId' | 'paid' | 'dueDay'>>) => void
  onDelete: (id: string) => void
  payable?: boolean
  dated?: boolean
}) {
  const [focusId, setFocusId] = useState<string | null>(null)
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  const [revealFixed, setRevealFixed] = useState(0)
  const [revealTerm, setRevealTerm] = useState(0)
  const [revealVariables, setRevealVariables] = useState(0)
  const [open, setOpen] = useState(false)
  const plazo = entries.filter((entry) => entry.termId)
  const fixed = entries.filter((entry) => entry.templateId && !entry.termId)
  const variable = entries.filter((entry) => !entry.templateId && !entry.termId)

  function toggle() {
    setOpen((current) => !current)
  }

  return (
    <section className={open ? 'ledger' : 'ledger is-closed'} aria-label={title}>
      <header className="ledger-head">
        <button className="ledger-toggle" aria-expanded={open} onClick={toggle}>
          <i className={open ? 'chev' : 'chev shut'} aria-hidden="true" />
          <h2>{title}</h2>
          <span>{entries.length}</span>
          {!open && <strong>{formatCOP(total)}</strong>}
        </button>
      </header>
      {open && (
        <div className="rows">
          <Group
            label="Fijos"
            addLabel="Agregar fijo"
            reveal={revealFixed}
            onAdd={() => {
              const id = onAddFixed()
              setFocusId(id)
              setRevealFixed((current) => current + 1)
            }}
            entries={fixed}
            categories={categories}
            focusId={focusId}
            creatingFor={creatingFor}
            payable={payable}
            dated={dated}
            onCreateStart={setCreatingFor}
            onCreateCancel={() => setCreatingFor(null)}
            onCreateCategory={onCreateCategory}
            onChange={onChange}
            onDelete={onDelete}
          />
          <Group
            label="Variables"
            addLabel="Agregar variable"
            reveal={revealVariables}
            onAdd={() => {
              const id = onAdd()
              setFocusId(id)
              setRevealVariables((current) => current + 1)
            }}
            entries={variable}
            categories={categories}
            focusId={focusId}
            creatingFor={creatingFor}
            payable={payable}
            dated={dated}
            onCreateStart={setCreatingFor}
            onCreateCancel={() => setCreatingFor(null)}
            onCreateCategory={onCreateCategory}
            onChange={onChange}
            onDelete={onDelete}
          />
          {onAddTerm && (
            <Group
              label="Periódico"
              addLabel="Agregar periódico"
              reveal={revealTerm}
              term
              onAdd={() => {
                setRevealTerm((current) => current + 1)
              }}
              onAddTerm={onAddTerm}
              entries={plazo}
              categories={categories}
              focusId={focusId}
              creatingFor={creatingFor}
              payable={payable}
              dated={dated}
              onCreateStart={setCreatingFor}
              onCreateCancel={() => setCreatingFor(null)}
              onCreateCategory={onCreateCategory}
              onChange={onChange}
              onDelete={onDelete}
            />
          )}
        </div>
      )}
      {open && (
        <footer className="ledger-total">
          <span>Total</span>
          <strong>{formatCOP(total)}</strong>
        </footer>
      )}
    </section>
  )
}

function Group({
  label,
  addLabel,
  reveal = 0,
  term = false,
  onAdd,
  onAddTerm,
  entries,
  categories,
  focusId,
  creatingFor,
  payable,
  dated,
  onCreateStart,
  onCreateCancel,
  onCreateCategory,
  onChange,
  onDelete,
}: {
  label: string
  addLabel: string
  reveal?: number
  term?: boolean
  onAdd: () => void
  onAddTerm?: (input: { description: string; categoryId: string | null; amount: number; startDate: string; months: number }) => string
  entries: Entry[]
  categories: Category[]
  focusId: string | null
  creatingFor: string | null
  payable: boolean
  dated: boolean
  onCreateStart: (id: string) => void
  onCreateCancel: () => void
  onCreateCategory: (name: string) => Category
  onChange: (id: string, patch: Partial<Pick<Entry, 'description' | 'amount' | 'categoryId' | 'paid' | 'dueDay'>>) => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0)

  useEffect(() => {
    if (!reveal) return
    setOpen(true)
    if (term) setDrafting(true)
  }, [reveal, term])

  function toggle() {
    setOpen((current) => !current)
  }

  return (
    <>
      <button className="split" aria-expanded={open} onClick={toggle}>
        <i className={open ? 'chev' : 'chev shut'} aria-hidden="true" />
        <span>{label}</span>
        <em>{entries.length}</em>
        <strong>{formatCOP(total)}</strong>
      </button>
      {open && drafting && onAddTerm && (
        <TermForm
          categories={categories}
          onSubmit={(input) => {
            onAddTerm(input)
            setDrafting(false)
          }}
        />
      )}
      {open && entries.length === 0 && !drafting && <p className="empty">Sin {label.toLowerCase()}.</p>}
      {open && entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          categories={categories}
          autoFocus={entry.id === focusId}
          creating={creatingFor === entry.id}
          onCreateStart={() => onCreateStart(entry.id)}
          onCreateCancel={onCreateCancel}
          onCreate={(name) => {
            const category = onCreateCategory(name)
            onChange(entry.id, { categoryId: category.id })
            onCreateCancel()
          }}
          payable={payable}
          dated={dated}
          onChange={(patch) => onChange(entry.id, patch)}
          onDelete={() => onDelete(entry.id)}
        />
      ))}
      {open && (
        <button
          className="add-row"
          onClick={() => {
            if (term) {
              setDrafting(true)
              return
            }
            onAdd()
          }}
        >
          + {addLabel}
        </button>
      )}
    </>
  )
}

function EntryRow({
  entry,
  categories,
  autoFocus,
  creating,
  onCreateStart,
  onCreateCancel,
  onCreate,
  onChange,
  onDelete,
  payable,
  dated,
}: {
  entry: Entry
  categories: Category[]
  autoFocus: boolean
  creating: boolean
  onCreateStart: () => void
  onCreateCancel: () => void
  onCreate: (name: string) => void
  onChange: (patch: Partial<Pick<Entry, 'description' | 'amount' | 'categoryId' | 'paid' | 'dueDay'>>) => void
  onDelete: () => void
  payable: boolean
  dated: boolean
}) {
  const [name, setName] = useState('')
  const selected = categories.find((c) => c.id === entry.categoryId)
  const title = entry.description.trim()

  useEffect(() => {
    if (!creating) setName('')
  }, [creating])

  const categorySelect = (
    <select
      className="cat"
      aria-label="Categoría"
      style={{ borderLeftColor: selected?.color ?? '#d9d0c3' }}
      value={entry.categoryId ?? ''}
      onChange={(event) => {
        if (event.target.value === '__new__') onCreateStart()
        else {
          const category = categories.find((item) => item.id === event.target.value)
          if (category) onChange({ categoryId: category.id })
        }
      }}
    >
      {!entry.categoryId && <option value="">Categoría</option>}
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
      <option value="__new__">+ Nueva categoría</option>
    </select>
  )

  return (
    <div className={entry.paid ? 'row is-paid' : 'row'}>
      {payable && (
        <label className={entry.paid ? 'paid on' : 'paid'}>
          <input
            type="checkbox"
            checked={Boolean(entry.paid)}
            aria-label={entry.paid ? 'Pagado' : 'Marcar como pagado'}
            onChange={(event) => onChange({ paid: event.target.checked })}
          />
          <span />
        </label>
      )}
      {creating ? (
        <form
          className="pop"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) onCreate(name.trim())
          }}
        >
          <input autoFocus value={name} placeholder="Nueva categoría" aria-label="Nueva categoría" onChange={(event) => setName(event.target.value)} />
          <button type="submit">Crear</button>
          <button type="button" onClick={onCreateCancel}>
            ×
          </button>
        </form>
      ) : (
        <div className="row-main">
          <input
            className="desc"
            value={entry.description}
            placeholder="Ítem"
            aria-label="Ítem"
            onChange={(event) => onChange({ description: event.target.value })}
          />
          {categorySelect}
        </div>
      )}
      {entry.termTotal != null && entry.termIndex != null && <em className="term-note">{entry.termIndex}/{entry.termTotal}</em>}
      {dated && <DueField value={entry.dueDay} onCommit={(dueDay) => onChange({ dueDay })} />}
      <MoneyField autoFocus={autoFocus} value={entry.amount} onCommit={(amount) => onChange({ amount })} />
      <button className="del" aria-label={`Eliminar ${title || selected?.name || 'movimiento'}`} onClick={onDelete}>
        ×
      </button>
    </div>
  )
}

function DueField({ value, onCommit }: { value: number | null; onCommit: (day: number | null) => void }) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => {
    setText(value ? String(value) : '')
  }, [value])

  return (
    <input
      className="due"
      inputMode="numeric"
      aria-label="Día de pago"
      placeholder="día"
      value={text}
      onChange={(event) => setText(event.target.value.replace(/\D/g, '').slice(0, 2))}
      onBlur={() => {
        if (!text.trim()) {
          onCommit(null)
          return
        }
        const day = Math.min(31, Math.max(1, Number(text)))
        onCommit(day)
        setText(String(day))
      }}
    />
  )
}

function TermForm({
  categories,
  onSubmit,
}: {
  categories: Category[]
  onSubmit: (input: { description: string; categoryId: string | null; amount: number; startDate: string; months: number }) => void
}) {
  const [itemName, setItemName] = useState('')
  const [date, setDate] = useState('')
  const [months, setMonths] = useState('')
  const [amountText, setAmountText] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const amount = parseCOP(amountText)

  return (
    <form
      className="quiet-form term-form"
      onSubmit={(event) => {
        event.preventDefault()
        const count = Math.max(1, Math.min(24, Number(months) || 0))
        if (amount <= 0 || !date || !categoryId || !itemName.trim() || count < 1) return
        onSubmit({
          description: itemName.trim(),
          categoryId,
          amount,
          startDate: date,
          months: count,
        })
      }}
    >
      <input value={itemName} autoFocus placeholder="Ítem" aria-label="Ítem" onChange={(event) => setItemName(event.target.value)} />
      <div className="term-line">
        <label>
          Categoría
          <select aria-label="Categoría" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
            <option value="">Categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Plazo
          <input inputMode="numeric" aria-label="Plazo en meses" placeholder="Meses" value={months} onChange={(event) => setMonths(event.target.value.replace(/\D/g, '').slice(0, 2))} />
        </label>
      </div>
      <label className="term-amount">
        Fecha de pago
        <input type="date" aria-label="Fecha de pago" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      <label className="term-amount">
        Valor
        <input
          inputMode="numeric"
          aria-label="Valor"
          placeholder="$0"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
        />
      </label>
      <button className="btn primary term-save" type="submit" disabled={amount <= 0 || !date || !categoryId || !itemName.trim() || Number(months) < 1}>
        Guardar
      </button>
    </form>
  )
}

export { SWATCHES }

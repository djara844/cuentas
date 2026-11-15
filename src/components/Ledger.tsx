import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Category, Entry } from '../types'
import { formatCOP, parseCOP } from '../money'

export type ItemInput = {
  description: string
  categoryId: string | null
  amount: number
  dueDay: number | null
  paid: boolean
  debtId: string | null
}

type DebtOption = { id: string; name: string; categoryId: string | null }

const SWATCHES = ['#38bdf8', '#22d3ee', '#818cf8', '#c084fc', '#f472b6', '#fb7185', '#fb923c', '#fbbf24', '#2dd4bf', '#60a5fa', '#a78bfa', '#94a3b8']

export function Ledger({
  title,
  entries,
  categories,
  total,
  onAdd,
  onAddFixed,
  onCreateCategory,
  onChange,
  onDelete,
  payable = false,
  dated = false,
  debts = [],
}: {
  title: string
  entries: Entry[]
  categories: Category[]
  total: number
  onAdd: (input: ItemInput) => void
  onAddFixed: (input: ItemInput) => void
  onCreateCategory: (name: string) => Category
  onChange: (id: string, patch: Partial<Pick<Entry, 'description' | 'amount' | 'categoryId' | 'paid' | 'dueDay'>>) => void
  onDelete: (id: string) => void
  payable?: boolean
  dated?: boolean
  debts?: DebtOption[]
}) {
  const [revealFixed, setRevealFixed] = useState(0)
  const [revealVariables, setRevealVariables] = useState(0)
  const [open, setOpen] = useState(false)
  const scheduled = entries.filter((entry) => entry.debtId && !entry.advance)
  const advances = entries.filter((entry) => entry.advance)
  const plain = entries.filter((entry) => !entry.debtId && !entry.advance)
  const fixed = [...plain.filter((entry) => entry.templateId && !entry.termId), ...scheduled]
  const variable = [...plain.filter((entry) => !entry.templateId && !entry.termId), ...advances]

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
            onAdd={(input) => {
              onAddFixed(input)
              setRevealFixed((current) => current + 1)
            }}
            entries={fixed}
            categories={categories}
            payable={payable}
            dated={dated}
            onCreateCategory={onCreateCategory}
            onChange={onChange}
            onDelete={onDelete}
          />
          <Group
            label="Variables"
            addLabel="Agregar variable"
            reveal={revealVariables}
            onAdd={(input) => {
              onAdd(input)
              setRevealVariables((current) => current + 1)
            }}
            entries={variable}
            debts={debts}
            categories={categories}
            payable={payable}
            dated={dated}
            onCreateCategory={onCreateCategory}
            onChange={onChange}
            onDelete={onDelete}
          />
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
  onAdd,
  entries,
  extra,
  extraTotal = 0,
  extraCount = 0,
  debts = [],
  categories,
  payable,
  dated,
  onCreateCategory,
  onChange,
  onDelete,
}: {
  label: string
  addLabel: string
  reveal?: number
  onAdd: (input: ItemInput) => void
  entries: Entry[]
  extra?: ReactNode
  extraTotal?: number
  extraCount?: number
  debts?: DebtOption[]
  categories: Category[]
  payable: boolean
  dated: boolean
  onCreateCategory: (name: string) => Category
  onChange: (id: string, patch: Partial<Pick<Entry, 'description' | 'amount' | 'categoryId' | 'paid' | 'dueDay'>>) => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0) + extraTotal

  useEffect(() => {
    if (!reveal) return
    setOpen(true)
  }, [reveal])

  function toggle() {
    setOpen((current) => !current)
  }

  return (
    <>
      <button className="split" aria-expanded={open} onClick={toggle}>
        <i className={open ? 'chev' : 'chev shut'} aria-hidden="true" />
        <span>{label}</span>
        <em>{entries.length + extraCount}</em>
        <strong>{formatCOP(total)}</strong>
      </button>
      {open && extra}
      {open && entries.length === 0 && !extra && <p className="empty">Sin {label.toLowerCase()}.</p>}
      {open && entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          categories={categories}
          debts={debts}
          onCreateCategory={onCreateCategory}
          payable={payable}
          dated={dated}
          onChange={(patch) => onChange(entry.id, patch)}
          onDelete={() => onDelete(entry.id)}
        />
      ))}
      {open && adding && (
        <EntryEditor
          heading={`Agregar ${label.toLowerCase().replace(/s$/, '')}`}
          initial={{ description: '', categoryId: null, amount: 0, paid: false, dueDay: null, debtId: null }}
          categories={categories}
          debts={debts}
          payable={payable}
          dated={dated}
          onCreateCategory={onCreateCategory}
          onClose={() => setAdding(false)}
          onSave={(input) => {
            onAdd(input)
            setAdding(false)
          }}
        />
      )}
      {open && (
        <button
          className="add-row"
          onClick={() => setAdding(true)}
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
  debts = [],
  onCreateCategory,
  onChange,
  onDelete,
  payable,
  dated,
}: {
  entry: Entry
  categories: Category[]
  debts?: DebtOption[]
  onCreateCategory: (name: string) => Category
  onChange: (patch: Partial<Pick<Entry, 'description' | 'amount' | 'categoryId' | 'paid' | 'dueDay'>>) => void
  onDelete: () => void
  payable: boolean
  dated: boolean
}) {
  const [editing, setEditing] = useState(false)
  const selected = categories.find((category) => category.id === entry.categoryId)
  const debtName = debts.find((debt) => debt.id === entry.debtId)?.name
  const title = entry.description.trim() || 'Sin nombre'
  const meta = [
    dated && entry.dueDay ? `día ${entry.dueDay}` : '',
    debtName && (entry.advance || title !== debtName) ? debtName : '',
    entry.debtId && !debtName ? 'Deuda' : '',
  ].filter(Boolean)

  return (
    <article className={entry.paid ? 'item is-paid' : 'item'}>
      <div className="item-copy">
        <em className="tag" style={selected ? { ['--tag' as string]: selected.color } : undefined}>{selected?.name ?? 'Sin categoría'}</em>
        <strong>{title}</strong>
        {meta.length > 0 && <small>{meta.join(' · ')}</small>}
      </div>
      <b className={entry.kind === 'ingreso' ? 'item-amount pos' : 'item-amount'}>{formatCOP(entry.amount)}</b>
      <div className="item-actions">
        {payable ? (
          <button
            type="button"
            className={entry.paid ? 'pay-chip on' : 'pay-chip'}
            aria-pressed={Boolean(entry.paid)}
            onClick={() => onChange({ paid: !entry.paid })}
          >
            {entry.paid ? 'Pagado' : 'Pagar'}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="item-edit" onClick={() => setEditing(true)}>
          Editar
        </button>
      </div>
      {editing && (
        <EntryEditor
          heading="Editar"
          entry={entry}
          categories={categories}
          payable={payable}
          dated={dated}
          onCreateCategory={onCreateCategory}
          onClose={() => setEditing(false)}
          onDelete={() => {
            onDelete()
            setEditing(false)
          }}
          onSave={(patch) => {
            onChange(patch)
            setEditing(false)
          }}
        />
      )}
    </article>
  )
}

export function EntryEditor({
  heading = 'Editar',
  entry,
  initial,
  categories,
  payable,
  dated,
  debts = [],
  onCreateCategory,
  onClose,
  onDelete,
  onSave,
}: {
  heading?: string
  entry?: Entry
  initial?: ItemInput
  categories: Category[]
  payable: boolean
  dated: boolean
  debts?: DebtOption[]
  onCreateCategory: (name: string) => Category
  onClose: () => void
  onDelete?: () => void
  onSave: (input: ItemInput) => void
}) {
  const source = entry ?? initial ?? { description: '', categoryId: null, amount: 0, dueDay: null, paid: false, debtId: null }
  const [description, setDescription] = useState(source.description)
  const [categoryId, setCategoryId] = useState(source.categoryId ?? '')
  const [debtId, setDebtId] = useState(source.debtId ?? '')
  const [due, setDue] = useState(source.dueDay ? String(source.dueDay) : '')
  const [amountText, setAmountText] = useState(source.amount ? String(Math.round(source.amount)) : '')
  const [paid, setPaid] = useState(Boolean(source.paid))
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  function save(event: FormEvent) {
    event.preventDefault()
    const picked = debts.find((debt) => debt.id === debtId)
    if (!(description.trim() || picked) || !(categoryId || picked?.categoryId)) return
    const day = due.trim() ? Math.min(31, Math.max(1, Number(due))) : null
    onSave({
      description: description.trim() || picked?.name || '',
      categoryId: categoryId || picked?.categoryId || '',
      amount: parseCOP(amountText),
      paid: payable ? paid : Boolean(source.paid),
      dueDay: dated ? day : source.dueDay,
      debtId: debtId || null,
    })
  }

  return createPortal(
    <div className="sheet-back" onClick={onClose}>
      <form className="sheet" role="dialog" aria-label={heading} onClick={(event) => event.stopPropagation()} onSubmit={save}>
        <div className="sheet-handle" />
        <div className="sheet-title">
          <h2>{heading}</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <label className="field">
          Ítem
          <input autoFocus value={description} placeholder="Nombre del ítem" onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="field">
          Categoría
          {creating ? (
            <span className="pop">
              <input autoFocus value={newName} placeholder="Nueva categoría" aria-label="Nueva categoría" onChange={(event) => setNewName(event.target.value)} />
              <button
                type="button"
                onClick={() => {
                  if (!newName.trim()) return
                  const category = onCreateCategory(newName.trim())
                  setCategoryId(category.id)
                  setNewName('')
                  setCreating(false)
                }}
              >
                Crear
              </button>
              <button type="button" onClick={() => setCreating(false)}>
                ×
              </button>
            </span>
          ) : (
            <select value={categoryId} onChange={(event) => (event.target.value === '__new__' ? setCreating(true) : setCategoryId(event.target.value))}>
              <option value="">Categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              <option value="__new__">+ Nueva categoría</option>
            </select>
          )}
        </label>
        {debts.length > 0 && (
          <label className="field">
            Deuda
            <select
              value={debtId}
              onChange={(event) => {
                const next = event.target.value
                setDebtId(next)
                const debt = debts.find((item) => item.id === next)
                if (debt?.categoryId && !categoryId) setCategoryId(debt.categoryId)
                if (debt && !description.trim()) setDescription(debt.name)
              }}
            >
              <option value="">Sin deuda</option>
              {debts.map((debt) => (
                <option key={debt.id} value={debt.id}>
                  {debt.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {dated && (
          <label className="field">
            Día de pago
            <input inputMode="numeric" placeholder="Día" value={due} onChange={(event) => setDue(event.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
        )}
        <label className="field">
          Valor
          <input inputMode="numeric" placeholder="$0" value={amountText} onChange={(event) => setAmountText(event.target.value)} />
        </label>
        {payable && (
          <label className="field check-line">
            <input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} />
            Pagado
          </label>
        )}
        <div className="modal-actions">
          {onDelete && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (confirm(`¿Eliminar “${description.trim() || 'este ítem'}”?`)) onDelete()
              }}
            >
              Eliminar
            </button>
          )}
          <button className="btn primary" type="submit" disabled={!description.trim() || !categoryId}>
            Guardar
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

export { SWATCHES }

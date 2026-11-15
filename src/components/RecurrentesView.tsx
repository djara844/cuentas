import { useState } from 'react'
import type { Kind } from '../types'
import { KINDS, categoriesOf, templatesOf } from '../types'
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
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(0)
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')

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
              store.addTemplate({ kind, description: name.trim(), amount, categoryId })
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
            <div className="form-actions">
              <button className="btn" type="button" onClick={() => setCreating(false)}>
                Cancelar
              </button>
              <button className="btn primary" type="submit">
                Agregar a todos los meses
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

import { useState } from 'react'
import type { Kind } from '../types'
import { KINDS, categoriesOf, templatesOf } from '../types'
import { useStore } from '../store'
import { MoneyField } from './Fields'
import { SWATCHES } from './Ledger'

export function RecurrentesView() {
  const store = useStore()

  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <p className="kicker">En todos los meses</p>
          <h1 className="page-title">Fijos</h1>
          <p className="formula">Aquí defines lo que se repite. También puedes agregarlo desde el mes, dentro de Fijos. Un variable se crea solo en ese mes, dentro de Variables.</p>
        </div>
      </header>
      <div className="cat-board">
        {KINDS.map((kind) => (
          <TemplateColumn key={`${kind.id}-cerrado`} kind={kind.id} label={kind.label} />
        ))}
      </div>
      <p className="hint alone">{store.db.templates.length} fijos, presentes en todos los periodos.</p>
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
          {templates.map((template, index) => {
            const color = categories.find((category) => category.id === template.categoryId)?.color ?? SWATCHES[index % SWATCHES.length]
            return (
              <li key={template.id} className="recur-item">
                <div className="recur-name">
                  <i style={{ background: color }} />
                  <input
                    value={template.description}
                    aria-label={`Nombre de ${template.description}`}
                    onChange={(event) => store.updateTemplate(template.id, { description: event.target.value })}
                  />
                </div>
                <div className="recur-line">
                  <select
                    aria-label={`Categoría de ${template.description}`}
                    value={template.categoryId ?? ''}
                    onChange={(event) => store.updateTemplate(template.id, { categoryId: event.target.value || null })}
                  >
                    <option value="">Sin categoría</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <MoneyField value={template.amount} onCommit={(next) => store.updateTemplate(template.id, { amount: next })} />
                </div>
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
              if (!name.trim()) return
              store.addTemplate({ kind, description: name.trim(), amount, categoryId: categoryId || null })
              setName('')
              setAmount(0)
              setCreating(false)
            }}
          >
            <input value={name} autoFocus placeholder="Nombre" aria-label={`Nuevo fijo de ${label}`} onChange={(event) => setName(event.target.value)} />
            <div className="recur-line">
              <select aria-label="Categoría inicial" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Sin categoría</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <MoneyField value={amount} onCommit={setAmount} />
            </div>
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

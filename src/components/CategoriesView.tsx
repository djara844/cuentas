import { useState } from 'react'
import type { Kind } from '../types'
import { KINDS, categoriesOf } from '../types'
import { useStore } from '../store'
import { SWATCHES } from './Ledger'

export function CategoriesView() {
  const store = useStore()

  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <p className="kicker">Administrar</p>
          <h1 className="page-title">Categorías</h1>
          <p className="formula">Agrupan sueldos, gastos y servicios. Ábrelas para crear, renombrar o borrar.</p>
        </div>
      </header>
      <div className="cat-board">
        {KINDS.map((kind) => (
          <CategoryColumn key={`${kind.id}-cerrado`} kind={kind.id} label={kind.label} />
        ))}
      </div>
      <p className="hint alone">{store.db.categories.length} categorías en el libro.</p>
    </div>
  )
}

function CategoryColumn({ kind, label }: { kind: Kind; label: string }) {
  const store = useStore()
  const categories = categoriesOf(store.db, kind)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(SWATCHES[categories.length % SWATCHES.length])

  function toggle() {
    setOpen((current) => !current)
  }

  return (
    <section className={open ? 'cat-col' : 'cat-col is-closed'} aria-label={label}>
      <header className="ledger-head">
        <button className="ledger-toggle" aria-expanded={open} onClick={toggle}>
          <i className={open ? 'chev' : 'chev shut'} aria-hidden="true" />
          <h2>{label}</h2>
          <span>{categories.length}</span>
        </button>
      </header>
      {open && (
        <ul className="cat-list">
          {categories.map((category) => {
            const used = store.db.entries.filter((entry) => entry.categoryId === category.id).length
            return (
              <li key={category.id} className="cat-item">
                <i style={{ background: category.color }} />
                <input
                  value={category.name}
                  aria-label={`Nombre de ${category.name}`}
                  onChange={(event) => store.updateCategory(category.id, { name: event.target.value })}
                />
                <small>{used}</small>
                <button
                  className="del"
                  aria-label={`Eliminar ${category.name}`}
                  onClick={() => {
                    const message = used
                      ? `“${category.name}” está en ${used} movimientos. Se quita la categoría, no el movimiento.`
                      : `¿Eliminar “${category.name}”?`
                    if (confirm(message)) store.removeCategory(category.id)
                  }}
                >
                  ×
                </button>
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
              store.addCategory({ name, kind, color })
              setName('')
              setColor(SWATCHES[(categories.length + 1) % SWATCHES.length])
              setCreating(false)
            }}
          >
            <input value={name} autoFocus placeholder="Nombre" aria-label={`Nueva categoría de ${label}`} onChange={(event) => setName(event.target.value)} />
            <div className="swatches" role="listbox" aria-label="Color">
              {SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={swatch === color ? 'swatch on' : 'swatch'}
                  style={{ background: swatch }}
                  aria-label={swatch}
                  onClick={() => setColor(swatch)}
                />
              ))}
            </div>
            <div className="form-actions">
              <button className="btn" type="button" onClick={() => setCreating(false)}>
                Cancelar
              </button>
              <button className="btn primary" type="submit">
                Crear
              </button>
            </div>
          </form>
        ) : (
          <button className="add-row" onClick={() => setCreating(true)}>
            + Nueva categoría
          </button>
        ))}
    </section>
  )
}

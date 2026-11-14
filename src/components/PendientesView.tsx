import { useMemo, useState } from 'react'
import { go } from '../route'
import { Mark } from '../icons'
import { TASK_COLORS, useBoard, type TaskCard } from '../tasks'

export function PendientesView() {
  const board = useBoard()
  const [filterId, setFilterId] = useState<string | null>(null)
  const [activeColumn, setActiveColumn] = useState(board.columns[0]?.id ?? '')
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)

  const filter = board.categories.find((category) => category.id === filterId) ?? null
  const visible = useMemo(
    () => board.cards.filter((card) => !filter || card.categoryId === filter.id),
    [board.cards, filter],
  )
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const card of board.cards) {
      if (!card.categoryId) continue
      map.set(card.categoryId, (map.get(card.categoryId) ?? 0) + 1)
    }
    return map
  }, [board.cards])

  function toggleFilter(id: string) {
    setFilterId((current) => (current === id ? null : id))
  }

  function showColumn(id: string) {
    setActiveColumn(id)
    document.getElementById(`col-${id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  function openCreate(columnId: string) {
    setDraft({
      mode: 'create',
      columnId,
      categoryId: filter?.id ?? null,
      title: '',
      detail: '',
      due: '',
    })
  }

  function openEdit(card: TaskCard) {
    setDraft({
      mode: 'edit',
      cardId: card.id,
      columnId: card.columnId,
      categoryId: card.categoryId,
      title: card.title,
      detail: card.detail,
      due: card.due ?? '',
    })
  }

  function saveDraft() {
    if (!draft || !draft.title.trim()) return
    if (draft.mode === 'create') {
      board.addCard({
        columnId: draft.columnId,
        categoryId: draft.categoryId,
        title: draft.title,
        detail: draft.detail,
        due: draft.due || null,
      })
    } else {
      board.updateCard(draft.cardId, {
        columnId: draft.columnId,
        categoryId: draft.categoryId,
        title: draft.title.trim(),
        detail: draft.detail.trim(),
        due: draft.due || null,
      })
    }
    setDraft(null)
    showColumn(draft.columnId)
  }

  const status = filter
    ? `${filter.name} · ${visible.length} ${visible.length === 1 ? 'tarea' : 'tareas'}`
    : `${board.cards.length} ${board.cards.length === 1 ? 'tarea' : 'tareas'} en el tablero`

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" aria-label="Inicio" onClick={() => go('inicio')}>
          <HomeIcon />
        </button>
        <div className="brand">
          <span>Pendientes</span>
          <small>Toca una categoría para filtrar</small>
        </div>
        <button className="icon-btn cal" aria-label="Calendario" onClick={() => go('calendario')}>
          <Mark name="Calendario" />
        </button>
        <button className={categoriesOpen ? 'icon-btn on' : 'icon-btn'} aria-label="Administrar categorías" onClick={() => setCategoriesOpen(true)}>
          <TagIcon />
        </button>
      </header>

      <div className="icon-grid" role="toolbar" aria-label="Filtrar por categoría">
        <button className={filter ? 'icon-box' : 'icon-box on'} style={{ ['--chip' as string]: '#e8e8e8' }} onClick={() => setFilterId(null)} aria-pressed={!filter}>
          <Mark name="Todas" />
          <strong>Todas</strong>
          <em>{board.cards.length}</em>
        </button>
        {board.categories.map((category) => {
          const on = filter?.id === category.id
          return (
            <button
              key={category.id}
              className={on ? 'icon-box on' : 'icon-box'}
              style={{ ['--chip' as string]: category.color }}
              aria-pressed={on}
              onClick={() => toggleFilter(category.id)}
            >
              <Mark name={category.name} />
              <strong>{category.name}</strong>
              <em>{counts.get(category.id) ?? 0}</em>
            </button>
          )
        })}
      </div>
      <button className="text-btn cat-manage" onClick={() => setCategoriesOpen(true)}>
        Editar categorías
      </button>
      <p className="filter-status" aria-live="polite">
        {status}
        {filter ? ' · toca otra vez para ver todas' : ''}
      </p>

      <div className="icon-grid" aria-label="Listas">
        {board.columns.map((column) => {
          const count = visible.filter((card) => card.columnId === column.id).length
          return (
            <button
              key={column.id}
              className={activeColumn === column.id ? 'icon-box on' : 'icon-box'}
              style={{ ['--chip' as string]: column.name === 'Por hacer' ? '#94a3b8' : column.name === 'En curso' ? '#38bdf8' : '#c084fc' }}
              onClick={() => showColumn(column.id)}
            >
              <Mark name={column.name} />
              <strong>{column.name}</strong>
              <em>{count}</em>
            </button>
          )
        })}
      </div>

      <div className="board">
        {board.columns.map((column, index) => {
          const cards = visible.filter((card) => card.columnId === column.id)
          const dim = Boolean(filter) && cards.length === 0
          return (
            <section key={column.id} id={`col-${column.id}`} className={dim ? 't-col dim' : 't-col'} aria-label={column.name}>
              <header className="t-col-head">
                <h2 className="t-col-name">{column.name}</h2>
                <span className="count">{cards.length}</span>
              </header>
              <div className="t-col-cards">
                {cards.length === 0 && (
                  <p className="empty">{filter ? `Nada de ${filter.name} aquí.` : 'Sin tareas. Agrega la primera.'}</p>
                )}
                {cards.map((card) => {
                  const category = board.categories.find((item) => item.id === card.categoryId)
                  const prev = board.columns[index - 1]
                  const next = board.columns[index + 1]
                  return (
                    <article key={card.id} className="t-card" style={{ ['--card-color' as string]: category?.color ?? '#4c8dff' }}>
                      <button className="t-card-body" onClick={() => openEdit(card)}>
                        <strong>{card.title}</strong>
                        {card.detail && <p>{card.detail}</p>}
                        {card.due && <time dateTime={card.due}>{formatDay(card.due)}</time>}
                        <span className="task-cat" style={{ color: category?.color ?? 'var(--muted)' }}>
                          <Mark name={category?.name ?? 'Sin categoría'} />
                          {category?.name ?? 'Sin categoría'}
                        </span>
                      </button>
                      <div className="t-move">
                        <button className="btn" disabled={!prev} onClick={() => prev && board.moveCard(card.id, prev.id)}>
                          {prev ? `← ${prev.name}` : '—'}
                        </button>
                        <button className="btn" disabled={!next} onClick={() => next && board.moveCard(card.id, next.id)}>
                          {next ? `${next.name} →` : '—'}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
              <button className="btn primary t-add" onClick={() => openCreate(column.id)}>
                + Tarea en {column.name}
              </button>
            </section>
          )
        })}
      </div>

      {categoriesOpen && (
        <CategorySheet
          categories={board.categories}
          onClose={() => setCategoriesOpen(false)}
          onAdd={board.addCategory}
          onUpdate={board.updateCategory}
          onRemove={(id, name) => {
            const used = board.cards.some((card) => card.categoryId === id)
            const note = used
              ? `¿Borrar “${name}”? Las tareas de esa categoría quedan sin categoría.`
              : `¿Borrar “${name}”?`
            if (confirm(note)) {
              board.removeCategory(id)
              if (filterId === id) setFilterId(null)
            }
          }}
        />
      )}

      {draft && (
        <div className="sheet-back" onClick={() => setDraft(null)}>
          <form
            className="sheet"
            role="dialog"
            aria-label={draft.mode === 'create' ? 'Nueva tarea' : 'Editar tarea'}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              saveDraft()
            }}
          >
            <div className="sheet-handle" />
            <div className="sheet-title">
              <h2>{draft.mode === 'create' ? 'Nueva tarea' : 'Editar tarea'}</h2>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={() => setDraft(null)}>
                ×
              </button>
            </div>
            <label className="field">
              Título
              <input value={draft.title} required autoFocus onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label className="field">
              Detalle
              <textarea rows={3} value={draft.detail} onChange={(event) => setDraft({ ...draft, detail: event.target.value })} />
            </label>
            <label className="field">
              Fecha
              <input type="date" value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} />
            </label>
            <div className="field">
              <span>Categoría</span>
              <div className="icon-grid">
                <button
                  type="button"
                  className={draft.categoryId ? 'icon-box' : 'icon-box on'}
                  style={{ ['--chip' as string]: '#a3a3a3' }}
                  onClick={() => setDraft({ ...draft, categoryId: null })}
                >
                  <Mark name="Sin categoría" />
                  <strong>Sin categoría</strong>
                </button>
                {board.categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={draft.categoryId === category.id ? 'icon-box on' : 'icon-box'}
                    style={{ ['--chip' as string]: category.color }}
                    onClick={() => setDraft({ ...draft, categoryId: category.id })}
                  >
                    <Mark name={category.name} />
                    <strong>{category.name}</strong>
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Lista</span>
              <div className="icon-grid">
                {board.columns.map((column) => (
                  <button
                    key={column.id}
                    type="button"
                    className={draft.columnId === column.id ? 'icon-box on' : 'icon-box'}
                    style={{ ['--chip' as string]: column.name === 'Por hacer' ? '#94a3b8' : column.name === 'En curso' ? '#38bdf8' : '#c084fc' }}
                    onClick={() => setDraft({ ...draft, columnId: column.id })}
                  >
                    <Mark name={column.name} />
                    <strong>{column.name}</strong>
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              {draft.mode === 'edit' && (
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    if (confirm('¿Eliminar esta tarea?')) {
                      board.removeCard(draft.cardId)
                      setDraft(null)
                    }
                  }}
                >
                  Eliminar
                </button>
              )}
              <button className="btn primary" type="submit">
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

type Draft =
  | { mode: 'create'; columnId: string; categoryId: string | null; title: string; detail: string; due: string }
  | { mode: 'edit'; cardId: string; columnId: string; categoryId: string | null; title: string; detail: string; due: string }

function formatDay(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return new Date(year, month - 1, day).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

function CategorySheet({
  categories,
  onClose,
  onAdd,
  onUpdate,
  onRemove,
}: {
  categories: { id: string; name: string; color: string }[]
  onClose: () => void
  onAdd: (name: string, color: string) => void
  onUpdate: (id: string, next: { name?: string; color?: string }) => void
  onRemove: (id: string, name: string) => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(TASK_COLORS[categories.length % TASK_COLORS.length] ?? TASK_COLORS[0])

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Categorías" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <h2>Categorías</h2>
        <p className="hint">Crea las que uses. En el tablero, toca una para ver solo esas tareas.</p>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault()
            onAdd(name, color)
            setName('')
            setColor(TASK_COLORS[(categories.length + 1) % TASK_COLORS.length] ?? TASK_COLORS[0])
          }}
        >
          <label className="field">
            Nueva categoría
            <input required value={name} placeholder="Por ejemplo, Trámites" onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="swatches" aria-label="Color de la categoría">
            {TASK_COLORS.map((swatch) => (
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
          <button className="btn primary" type="submit">
            Agregar categoría
          </button>
        </form>
        <ul className="task-cats">
          {categories.map((category) => (
            <li key={category.id}>
              <i className="dot" style={{ background: category.color }} />
              <input
                aria-label={`Nombre de ${category.name}`}
                value={category.name}
                onChange={(event) => onUpdate(category.id, { name: event.target.value })}
              />
              <button className="del" aria-label={`Borrar ${category.name}`} onClick={() => onRemove(category.id, category.name)}>
                ×
              </button>
              <div className="swatches mini">
                {TASK_COLORS.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    className={swatch === category.color ? 'swatch on' : 'swatch'}
                    style={{ background: swatch }}
                    aria-label={`Color ${swatch} para ${category.name}`}
                    onClick={() => onUpdate(category.id, { color: swatch })}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
        <button className="btn" type="button" onClick={onClose}>
          Listo
        </button>
      </div>
    </div>
  )
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M7 10.5V20h10v-9.5" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12V5h7l9 9-7 7-9-9z" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

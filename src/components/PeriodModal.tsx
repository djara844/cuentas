import { useEffect, useState } from 'react'
import { MONTHS, periodLabel } from '../types'

export function PeriodModal({
  title,
  year,
  month,
  label,
  showKeep,
  onClose,
  onSubmit,
}: {
  title: string
  year: number
  month: number
  label?: string
  showKeep?: boolean
  onClose: () => void
  onSubmit: (value: { label: string; year: number; coveredMonth: number; keepAmounts: boolean }) => void
}) {
  const [y, setY] = useState(year)
  const [m, setM] = useState(month)
  const [text, setText] = useState(label ?? periodLabel(year, month))
  const [touched, setTouched] = useState(Boolean(label))
  const [keep, setKeep] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <form
        className="modal"
        role="dialog"
        aria-labelledby="period-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit({ label: text.trim() || periodLabel(y, m), year: y, coveredMonth: m, keepAmounts: keep })
        }}
      >
        <h2 id="period-modal-title">{title}</h2>
        <label className="field">
          Año
          <input
            type="number"
            min={2000}
            max={2100}
            value={y}
            onChange={(event) => {
              const next = Number(event.target.value)
              setY(next)
              if (!touched) setText(periodLabel(next, m))
            }}
          />
        </label>
        <label className="field">
          Mes que cubre
          <select
            value={m}
            onChange={(event) => {
              const next = Number(event.target.value)
              setM(next)
              if (!touched) setText(periodLabel(y, next))
            }}
          >
            {MONTHS.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Etiqueta
          <input
            value={text}
            onChange={(event) => {
              setTouched(true)
              setText(event.target.value)
            }}
          />
        </label>
        {showKeep && (
          <label className="check">
            <input type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} />
            Conservar los valores
          </label>
        )}
        <p className="hint">
          {showKeep
            ? 'Si no conservas los valores, los fijos y el resto quedan en cero.'
            : 'El periodo nuevo trae los conceptos de Recurrentes, con su valor inicial.'}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary">
            Crear periodo
          </button>
        </div>
      </form>
    </div>
  )
}

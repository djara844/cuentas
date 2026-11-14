import { useEffect, useState } from 'react'
import { formatCOP, formatPlain, parseCOP } from '../money'

export function MoneyField({ value, onCommit, autoFocus }: { value: number; onCommit: (next: number) => void; autoFocus?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')

  useEffect(() => {
    if (!editing) setText(formatPlain(value))
  }, [value, editing])

  return (
    <input
      className={value < 0 ? 'money neg' : 'money'}
      inputMode="numeric"
      aria-label="Valor"
      autoFocus={autoFocus}
      value={editing ? text : formatCOP(value)}
      onFocus={(event) => {
        setEditing(true)
        setText(value ? String(Math.round(value)) : '')
        requestAnimationFrame(() => event.target.select())
      }}
      onChange={(event) => setText(event.target.value)}
      onBlur={(event) => {
        setEditing(false)
        const next = parseCOP(event.target.value)
        if (next !== value) onCommit(next)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

export function TextField({
  value,
  placeholder,
  ariaLabel,
  autoFocus,
  className,
  onCommit,
}: {
  value: string
  placeholder?: string
  ariaLabel: string
  autoFocus?: boolean
  className?: string
  onCommit: (next: string) => void
}) {
  const [text, setText] = useState(value)

  useEffect(() => {
    setText(value)
  }, [value])

  return (
    <input
      className={className}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={text}
      autoFocus={autoFocus}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

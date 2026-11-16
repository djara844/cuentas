import { useState } from 'react'

function Eye({ off }: { off: boolean }) {
  if (off) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 3l18 18" />
        <path d="M10.5 10.7a2 2 0 0 0 2.8 2.8" />
        <path d="M9.9 5.1A11 11 0 0 1 12 4.8c5.2 0 9.3 3.2 11 7.2a12 12 0 0 1-3.2 4.2" />
        <path d="M6.1 6.1C4 7.5 2.4 9.5 1.8 12c1.6 3.6 5.6 7.2 10.2 7.2 1.6 0 3.1-.3 4.4-.9" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function PasswordField({
  label,
  value,
  autoComplete,
  onChange,
}: {
  label: string
  value: string
  autoComplete: 'current-password' | 'new-password'
  onChange: (value: string) => void
}) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="field">
      {label}
      <span className="secret">
        <input
          required
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="secret-toggle"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          <Eye off={visible} />
        </button>
      </span>
    </label>
  )
}

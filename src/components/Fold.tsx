import { useState, type ReactNode } from 'react'

export function Fold({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section className={open ? 'fold' : 'fold is-closed'}>
      <button type="button" className="ledger-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <i className={open ? 'chev' : 'chev shut'} aria-hidden="true" />
        <h2>{title}</h2>
        {meta != null && meta !== false && <strong>{meta}</strong>}
      </button>
      {open && <div className="fold-body">{children}</div>}
    </section>
  )
}

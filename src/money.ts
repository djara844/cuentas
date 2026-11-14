export function formatCOP(value: number): string {
  const n = Math.round(Number.isFinite(value) ? value : 0)
  const sign = n < 0 ? '-' : ''
  const digits = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}$${digits}`
}

export function parseCOP(raw: string): number {
  const text = raw.trim()
  if (!text || text === '-' || text === '$') return 0
  const neg = text.includes('-')
  const digits = text.replace(/[^\d]/g, '')
  const n = digits ? Number(digits) : 0
  return neg ? -n : n
}

export function formatPlain(value: number): string {
  if (!value) return ''
  return String(Math.round(value))
}

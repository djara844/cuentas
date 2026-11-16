export type Kind = 'ingreso' | 'gasto' | 'servicio'

export interface Category {
  id: string
  name: string
  kind: Kind
  color: string
  sortOrder: number
}

export interface Period {
  id: string
  label: string
  year: number
  coveredMonth: number
  sortOrder: number
}

export interface Template {
  id: string
  kind: Kind
  categoryId: string | null
  description: string
  amount: number
  sortOrder: number
  startYear?: number | null
  startMonth?: number | null
  months?: number | null
}

export interface Entry {
  id: string
  periodId: string
  categoryId: string | null
  kind: Kind
  description: string
  amount: number
  sortOrder: number
  templateId: string | null
  paid: boolean
  dueDay: number | null
  termId: string | null
  termTotal: number | null
  termIndex: number | null
  debtId: string | null
  advance: boolean
}

export interface Debt {
  id: string
  name: string
  total: number
  cuota: number
  categoryId: string | null
  startYear: number
  startMonth: number
  months?: number | null
}

export interface Projection {
  fromYear: number
  fromMonth: number
  toYear: number
  toMonth: number
}

export interface DB {
  categories: Category[]
  periods: Period[]
  entries: Entry[]
  templates: Template[]
  debts: Debt[]
  projection?: Projection
}

export interface Stats {
  ingresos: number
  gastos: number
  servicios: number
  libre: number
}

export const KINDS: { id: Kind; label: string }[] = [
  { id: 'ingreso', label: 'Ingresos' },
  { id: 'gasto', label: 'Gastos' },
]

export const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, (c) => {
    const n = (Math.random() * 16) | 0
    return (c === 'x' ? n : (n & 0x3) | 0x8).toString(16)
  })
}

export function periodLabel(year: number, coveredMonth: number): string {
  const prev = new Date(year, coveredMonth, 0)
  return `${MONTHS[prev.getMonth()]} ${prev.getDate()} - ${MONTHS[coveredMonth]}`
}

export function sortOrderFor(year: number, coveredMonth: number): number {
  return year * 100 + coveredMonth
}

export function entriesOf(db: DB, periodId: string, kind: Kind): Entry[] {
  return db.entries
    .filter((e) => e.periodId === periodId && e.kind === kind)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.description.localeCompare(b.description, 'es'))
}

export function sumAmounts(list: Entry[]): number {
  return list.reduce((s, e) => s + (Number.isFinite(e.amount) ? e.amount : 0), 0)
}

export function periodStats(db: DB, periodId: string): Stats {
  const ingresos = sumAmounts(entriesOf(db, periodId, 'ingreso'))
  const gastos = sumAmounts(entriesOf(db, periodId, 'gasto'))
  const servicios = sumAmounts(entriesOf(db, periodId, 'servicio'))
  return { ingresos, gastos, servicios, libre: ingresos - gastos - servicios }
}

export function categoriesOf(db: DB, kind: Kind): Category[] {
  return db.categories.filter((c) => c.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function periodHasArrived(period: { year: number; coveredMonth: number }, today = new Date()) {
  if (period.year < today.getFullYear()) return true
  if (period.year > today.getFullYear()) return false
  return period.coveredMonth <= today.getMonth()
}

export function debtHorizon(db: DB): number | null {
  let last: number | null = null
  for (const debt of db.debts ?? []) {
    const start = debt.startYear * 12 + debt.startMonth
    let end = start
    if (typeof debt.months === 'number' && debt.months > 0) end = start + Math.min(36, debt.months) - 1
    else {
      for (const entry of db.entries) {
        if (entry.debtId !== debt.id || entry.advance) continue
        const period = db.periods.find((item) => item.id === entry.periodId)
        if (!period) continue
        end = Math.max(end, period.year * 12 + period.coveredMonth)
      }
    }
    last = last == null ? end : Math.max(last, end)
  }
  return last
}

export function periodIsListed(db: DB, period: Period, today = new Date()) {
  const at = period.year * 12 + period.coveredMonth
  const horizon = debtHorizon(db)
  const window = db.projection
  if (window) {
    const from = window.fromYear * 12 + window.fromMonth
    const to = Math.max(window.toYear * 12 + window.toMonth, horizon ?? 0)
    return at >= from && at <= to
  }
  if (periodHasArrived(period, today)) return true
  if (horizon != null && at <= horizon) return true
  if (db.entries.some((entry) => entry.periodId === period.id && entry.debtId)) return true
  return db.templates.some(
    (template) =>
      template.startYear != null &&
      template.startMonth != null &&
      template.months != null &&
      template.months >= 1 &&
      templateCovers(template, period.year, period.coveredMonth),
  )
}

export function templatesOf(db: DB, kind: Kind): Template[] {
  return db.templates.filter((t) => t.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function templateCovers(template: Template, year: number, month: number) {
  if (template.startYear == null || template.startMonth == null || template.months == null || template.months < 1) return true
  const start = template.startYear * 12 + template.startMonth
  const at = year * 12 + month
  return at >= start && at < start + template.months
}

export function instantiateTemplates(periodId: string, templates: Template[], when?: { year: number; month: number }): Entry[] {
  const list = when ? templates.filter((template) => templateCovers(template, when.year, when.month)) : templates
  return list.map((template) => ({
    id: uid(),
    periodId,
    categoryId: template.categoryId,
    kind: template.kind,
    description: template.description,
    amount: template.amount,
    sortOrder: template.sortOrder,
    templateId: template.id,
    paid: false,
    dueDay: null,
    termId: null,
    termTotal: null,
    termIndex: null,
    debtId: null,
    advance: false,
  }))
}

export function planSpan(total: number, cuota: number, months: number): number[] {
  const count = Math.max(1, Math.min(36, Math.round(months) || 1))
  const step = Math.max(0, Math.round(cuota))
  let left = Math.round(total)
  if (left <= 0) return []
  const amounts: number[] = []
  for (let index = 0; index < count && left > 0; index += 1) {
    const pay = index === count - 1 ? left : Math.min(step || left, left)
    amounts.push(pay)
    left -= pay
  }
  return amounts
}

export function planDebt(total: number, cuota: number): number[] {
  const amounts: number[] = []
  let left = Math.round(total)
  const step = Math.round(cuota)
  if (step <= 0 || left <= 0) return []
  while (left > 0 && amounts.length < 36) {
    const pay = Math.min(step, left)
    amounts.push(pay)
    left -= pay
  }
  return amounts
}

export function debtApplied(db: DB, debtId: string) {
  const linked = db.entries.filter((entry) => entry.debtId === debtId)
  const cuotas = linked.filter((entry) => !entry.advance)
  const avances = linked.filter((entry) => entry.advance)
  const paid = cuotas.filter((entry) => entry.paid).reduce((sum, entry) => sum + entry.amount, 0) + avances.filter((entry) => entry.paid).reduce((sum, entry) => sum + entry.amount, 0)
  return { cuotas, avances, paid }
}

export function isDB(value: unknown): value is DB {
  if (!value || typeof value !== 'object') return false
  const v = value as DB
  return Array.isArray(v.categories) && Array.isArray(v.periods) && Array.isArray(v.entries)
}

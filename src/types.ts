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
}

export interface DB {
  categories: Category[]
  periods: Period[]
  entries: Entry[]
  templates: Template[]
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

export function templatesOf(db: DB, kind: Kind): Template[] {
  return db.templates.filter((t) => t.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function instantiateTemplates(periodId: string, templates: Template[]): Entry[] {
  return templates.map((template) => ({
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
  }))
}

export function isDB(value: unknown): value is DB {
  if (!value || typeof value !== 'object') return false
  const v = value as DB
  return Array.isArray(v.categories) && Array.isArray(v.periods) && Array.isArray(v.entries)
}

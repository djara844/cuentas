import type { Category, DB, Entry, Kind, Period, Template } from './types'
import { periodLabel, sortOrderFor, uid } from './types'

const sid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

const CATS = {
  sueldo: sid(1),
  adicional: sid(2),
  intereses: sid(3),
  prima: sid(19),
  otrosIngresos: sid(20),
  arriendo: sid(4),
  libros: sid(5),
  banco: sid(6),
  tonello: sid(7),
  viajes: sid(8),
  transporte: sid(9),
  tc: sid(10),
  ahorro: sid(11),
  provision: sid(12),
  varios: sid(13),
  luz: sid(14),
  gas: sid(15),
  agua: sid(16),
  internet: sid(17),
  celular: sid(18),
} as const

type CatKey = keyof typeof CATS

const categories: Category[] = [
  { id: CATS.sueldo, name: 'Sueldo', kind: 'ingreso', color: '#38bdf8', sortOrder: 0 },
  { id: CATS.adicional, name: 'Sueldo adicional', kind: 'ingreso', color: '#22d3ee', sortOrder: 1 },
  { id: CATS.prima, name: 'Prima', kind: 'ingreso', color: '#818cf8', sortOrder: 2 },
  { id: CATS.intereses, name: 'Intereses bancarios', kind: 'ingreso', color: '#fbbf24', sortOrder: 3 },
  { id: CATS.otrosIngresos, name: 'Otros ingresos', kind: 'ingreso', color: '#c084fc', sortOrder: 4 },
  { id: CATS.arriendo, name: 'Arriendo', kind: 'gasto', color: '#fb7185', sortOrder: 0 },
  { id: CATS.libros, name: 'Diario', kind: 'gasto', color: '#60a5fa', sortOrder: 1 },
  { id: CATS.banco, name: 'Bancolombia', kind: 'gasto', color: '#f59e0b', sortOrder: 2 },
  { id: CATS.tonello, name: 'Cuota Tonello', kind: 'gasto', color: '#c084fc', sortOrder: 3 },
  { id: CATS.viajes, name: 'Viajes', kind: 'gasto', color: '#2dd4bf', sortOrder: 4 },
  { id: CATS.transporte, name: 'Transporte', kind: 'gasto', color: '#34d399', sortOrder: 5 },
  { id: CATS.tc, name: 'Tarjeta de crédito', kind: 'gasto', color: '#f472b6', sortOrder: 6 },
  { id: CATS.ahorro, name: 'Ahorro', kind: 'gasto', color: '#67e8f9', sortOrder: 7 },
  { id: CATS.provision, name: 'Provisión de servicios', kind: 'gasto', color: '#fb923c', sortOrder: 8 },
  { id: CATS.varios, name: 'Varios', kind: 'gasto', color: '#94a3b8', sortOrder: 9 },
  { id: CATS.luz, name: 'Luz', kind: 'servicio', color: '#fbbf24', sortOrder: 0 },
  { id: CATS.gas, name: 'Gas', kind: 'servicio', color: '#fb7185', sortOrder: 1 },
  { id: CATS.agua, name: 'Agua', kind: 'servicio', color: '#38bdf8', sortOrder: 2 },
  { id: CATS.internet, name: 'Internet', kind: 'servicio', color: '#818cf8', sortOrder: 3 },
  { id: CATS.celular, name: 'Celular', kind: 'servicio', color: '#e879f9', sortOrder: 4 },
]

const LEGACY_COLORS = new Set([
  '#1f7a45',
  '#2f8a57',
  '#146c43',
  '#c4920a',
  '#3d5a40',
  '#9a3412',
  '#1e3a5f',
  '#a37b08',
  '#6b3fa0',
  '#0f6e6e',
  '#9f2d3a',
  '#b45309',
  '#6b5e53',
  '#c47b2b',
  '#b64024',
  '#2b6cb0',
  '#3d4f8a',
  '#5c4d7a',
])

const palette = new Map(categories.map((category) => [category.id, category.color]))

export function paintedColor(id: string, color: string): string {
  const next = palette.get(id)
  if (next && LEGACY_COLORS.has(color.toLowerCase())) return next
  return color
}

type TemplateKey =
  | 'sueldo'
  | 'adicional'
  | 'prima'
  | 'intereses'
  | 'arriendo'
  | 'diario'
  | 'cuota'
  | 'banco'
  | 'luz'
  | 'gas'
  | 'agua'
  | 'internet'
  | 'celular'

const templateDefs: Array<{ key: TemplateKey; kind: Kind; cat: CatKey; description: string; amount: number; sortOrder: number }> = [
  { key: 'sueldo', kind: 'ingreso', cat: 'sueldo', description: 'Sueldo', amount: 3312000, sortOrder: 0 },
  { key: 'adicional', kind: 'ingreso', cat: 'adicional', description: 'Sueldo adicional', amount: 700000, sortOrder: 1 },
  { key: 'prima', kind: 'ingreso', cat: 'prima', description: 'Prima', amount: 0, sortOrder: 2 },
  { key: 'intereses', kind: 'ingreso', cat: 'intereses', description: 'Intereses bancarios', amount: 0, sortOrder: 3 },
  { key: 'arriendo', kind: 'gasto', cat: 'arriendo', description: 'Arriendo', amount: 600000, sortOrder: 0 },
  { key: 'diario', kind: 'gasto', cat: 'libros', description: 'Diario', amount: 1280000, sortOrder: 1 },
  { key: 'cuota', kind: 'gasto', cat: 'tonello', description: 'Cuota Tonello', amount: 1700000, sortOrder: 2 },
  { key: 'banco', kind: 'gasto', cat: 'banco', description: 'Bancolombia cuota de manejo', amount: 80000, sortOrder: 3 },
  { key: 'luz', kind: 'servicio', cat: 'luz', description: 'Luz', amount: 0, sortOrder: 0 },
  { key: 'gas', kind: 'servicio', cat: 'gas', description: 'Gas', amount: 0, sortOrder: 1 },
  { key: 'agua', kind: 'servicio', cat: 'agua', description: 'Agua', amount: 0, sortOrder: 2 },
  { key: 'internet', kind: 'servicio', cat: 'internet', description: 'Internet', amount: 0, sortOrder: 3 },
  { key: 'celular', kind: 'servicio', cat: 'celular', description: 'Celular', amount: 0, sortOrder: 4 },
]

const overrides: Partial<Record<TemplateKey, Partial<Record<number, number>>>> = {
  sueldo: { 2: 5317030, 3: 5317030, 4: 5019000, 5: 5312030 },
  adicional: { 1: 500000, 2: 750030, 4: 0 },
  prima: { 0: 1800000, 6: 1050000 },
  arriendo: { 2: 489030, 3: 489030, 4: 500030, 6: 800000 },
  diario: { 3: 1030030, 4: 1000030, 5: 1030030, 6: 1200000, 7: 1500000, 8: 1500000, 11: 1500000 },
  cuota: { 1: 0, 2: 1480030, 3: 1030030, 4: 1300030 },
  banco: { 2: 80030, 3: 80030, 5: 180030 },
  luz: { 1: 21170, 2: 24030, 3: 20220, 4: 20750 },
  gas: { 1: 8180, 2: 8780, 3: 8180, 4: 8180 },
  agua: { 1: 80030, 3: 15180 },
  internet: { 1: 70030, 2: 70030, 3: 70030, 4: 70030 },
  celular: { 1: 22030, 2: 22030, 3: 22030, 4: 22030 },
}

type Extra = [Kind, string, CatKey, number]

const extras: Record<number, Extra[]> = {
  0: [
    ['gasto', 'CLB', 'varios', 75000],
    ['gasto', 'Cuota extra', 'tonello', 1700000],
  ],
  1: [['gasto', 'Otro', 'varios', 75000]],
  2: [
    ['gasto', 'Transporte', 'transporte', 320030],
    ['gasto', 'Servicios Marzo', 'provision', 280030],
    ['gasto', 'TC', 'tc', 175030],
    ['gasto', 'Ahorro viaje', 'ahorro', 780030],
  ],
  3: [
    ['gasto', 'Servicios Abril', 'provision', 280030],
    ['gasto', 'TC', 'tc', 80030],
  ],
  4: [['gasto', 'Servicios Mayo', 'provision', 70000]],
  5: [
    ['gasto', 'Flete', 'varios', 100030],
    ['gasto', 'Helia', 'varios', 50030],
  ],
  6: [
    ['gasto', 'Internet', 'varios', 75000],
    ['gasto', 'Cuota extra', 'tonello', 37000],
    ['gasto', 'Celular', 'varios', 37000],
    ['gasto', 'Guitarra', 'varios', 120000],
    ['gasto', 'Vale', 'varios', 70000],
    ['gasto', 'Pago', 'varios', 180000],
    ['gasto', 'Microsoft', 'varios', 150000],
    ['gasto', 'Gym', 'varios', 100000],
    ['gasto', 'Acompañante', 'varios', 100000],
    ['gasto', 'Vacunas', 'varios', 20000],
  ],
  7: [
    ['gasto', 'CLB', 'varios', 75000],
    ['gasto', 'EL móvil', 'varios', 80000],
    ['gasto', 'Correo', 'varios', 20000],
    ['ingreso', 'Cars', 'otrosIngresos', 150000],
  ],
  8: [
    ['gasto', 'CLB', 'varios', 75000],
    ['gasto', 'Propina', 'varios', 20000],
  ],
  9: [
    ['gasto', 'CLB', 'varios', 75000],
    ['gasto', 'María', 'varios', 390000],
    ['gasto', 'Torta', 'varios', 20000],
    ['gasto', 'Evento uniforme', 'varios', 90000],
  ],
  10: [
    ['gasto', 'Daf', 'varios', 75000],
    ['gasto', 'Pappi', 'varios', 225000],
    ['gasto', 'Alianzas Jimmy', 'varios', 180000],
    ['gasto', 'Bailando Harry', 'varios', 50000],
    ['gasto', 'Cursor', 'varios', 55000],
    ['gasto', 'Gas', 'varios', 35000],
    ['gasto', 'Chiqui', 'varios', 180000],
    ['gasto', 'Ahorro', 'ahorro', 180000],
    ['gasto', 'Café', 'varios', 35000],
    ['ingreso', 'Abono', 'otrosIngresos', 180000],
  ],
  11: [
    ['gasto', 'CLB', 'varios', 76000],
    ['gasto', 'Aseo', 'varios', 117300],
    ['gasto', 'Balbo', 'varios', 100000],
    ['gasto', 'Jimmy', 'varios', 100000],
  ],
}

function buildTemplates(): Template[] {
  return templateDefs.map((item, index) => ({
    id: sid(300 + index),
    kind: item.kind,
    categoryId: CATS[item.cat],
    description: item.description,
    amount: item.amount,
    sortOrder: item.sortOrder,
  }))
}

export function buildSeed(year = 2026): DB {
  const templates = buildTemplates()
  const byKey = Object.fromEntries(templateDefs.map((item, index) => [item.key, templates[index]])) as Record<TemplateKey, Template>
  const periods: Period[] = []
  const entries: Entry[] = []

  for (let month = 0; month < 12; month++) {
    const periodId = sid(200 + month)
    periods.push({
      id: periodId,
      label: periodLabel(year, month),
      year,
      coveredMonth: month,
      sortOrder: sortOrderFor(year, month),
    })

    for (const item of templateDefs) {
      const template = byKey[item.key]
      const monthAmount = overrides[item.key]?.[month]
      entries.push({
        id: uid(),
        periodId,
        categoryId: template.categoryId,
        kind: template.kind,
        description: template.description,
        amount: monthAmount ?? template.amount,
        sortOrder: template.sortOrder,
        templateId: template.id,
        paid: false,
        dueDay: null,
        termId: null,
        termTotal: null,
        termIndex: null,
      })
    }

    ;(extras[month] ?? []).forEach((line, index) => {
      entries.push({
        id: uid(),
        periodId,
        categoryId: CATS[line[2]],
        kind: line[0],
        description: line[1],
        amount: line[3],
        sortOrder: 100 + index,
        templateId: null,
        paid: false,
        dueDay: null,
        termId: null,
        termTotal: null,
        termIndex: null,
      })
    })
  }

  return {
    categories: categories.map((category) => ({ ...category })),
    periods,
    entries,
    templates,
  }
}

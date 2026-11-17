import { readVault, writeVault } from './cloudLedger'
import { isDiego, ledgerId } from './authStore'

export interface Note {
  year: number
  age: number
  name: string
  count: number | null
  mark: boolean
}

function row(year: number, age: number, name: string, count: number | null, mark: boolean): Note {
  return { year, age, name: name.trim(), count, mark }
}

export const NOTES: Note[] = [
  row(2007, 17, 'Paola Vargas', null, true),
  row(2011, 21, 'Julieth Olguin', 1, false),
  row(2011, 21, 'Carolina Herrera', null, true),
  row(2011, 21, 'Johana Rubiano', null, true),
  row(2013, 23, 'Diana Henao', null, true),
  row(2016, 26, 'Angelica Casallas', 1, true),
  row(2016, 26, 'Claudia Castiblanco', 1, false),
  row(2017, 27, 'Johana Velazques', null, true),
  row(2017, 27, 'Lorena Zambrano', null, true),
  row(2017, 27, 'Nata Fajardo', null, true),
  row(2017, 27, 'Tatis Angarita', 3, false),
  row(2018, 28, 'Monica Orjuela', 2, false),
  row(2018, 28, 'Ana Quintero', 1, false),
  row(2018, 28, 'Liz Pineda', 2, false),
  row(2018, 28, 'Geraldine Jimenez', null, true),
  row(2018, 28, 'Fernanda Perez', 1, false),
  row(2018, 28, 'Alexa Sanchez', 1, false),
  row(2018, 28, 'Cindy Simpson', 1, false),
  row(2018, 28, 'Paola Fonseca', 1, false),
  row(2018, 28, 'Andrea Morales', 1, true),
  row(2018, 28, 'Yury Hernandez', 1, false),
  row(2019, 29, 'Dina Guzman', 2, true),
  row(2021, 31, 'Camila Gonzales', 1, false),
  row(2021, 31, 'Paola Joya', 1, true),
  row(2021, 31, 'Karen Soler', 1, true),
  row(2021, 31, 'Estefania Parra', null, true),
  row(2021, 31, 'Liz Londoño', 3, false),
  row(2022, 32, 'Julieta Ruiz', 1, true),
  row(2023, 33, 'Karina Sánchez', 1, false),
  row(2024, 34, 'Andrea Garcia', 1, true),
  row(2024, 34, 'Adriana', 2, true),
  row(2025, 35, 'Karen Bejarano', 2, false),
  row(2025, 35, 'Leidy Puentes', 1, false),
  row(2026, 36, 'Dafne', null, true),
]

const EXTRA_KEY = 'cuentas-registro-extra-v1'
const OVERRIDE_KEY = 'cuentas-registro-overrides-v1'
const GATE_HASH = '679fea7a7ddf4783cf51a722e5eaca24976bedb02fdf9dc38dee065e2bdfec3a'

function scoped(key: string) {
  const id = ledgerId()
  return id ? `${key}:${id}` : key
}

function readList(key: string): Note[] {
  try {
    const raw = localStorage.getItem(scoped(key)) || (isDiego() ? localStorage.getItem(key) : null)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Note[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && typeof item.name === 'string' && Number.isFinite(item.year))
  } catch {
    return []
  }
}

export function loadExtra(): Note[] {
  return readList(EXTRA_KEY)
}

function publishVault() {
  const rows = composeNotes()
  void writeVault({ extra: rows, overrides: {}, notes: rows })
}

export function saveExtra(notes: Note[]) {
  localStorage.setItem(scoped(EXTRA_KEY), JSON.stringify(notes))
  publishVault()
}

function readMap(key: string): Record<string, Note> {
  try {
    const raw = localStorage.getItem(scoped(key)) || (isDiego() ? localStorage.getItem(key) : null)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, Note>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function loadOverrides(): Record<string, Note> {
  return readMap(OVERRIDE_KEY)
}

export function saveOverride(key: string, note: Note) {
  const current = loadOverrides()
  current[key] = note
  localStorage.setItem(scoped(OVERRIDE_KEY), JSON.stringify(current))
  publishVault()
}

function composeNotes(): Note[] {
  const overrides = loadOverrides()
  const base = NOTES.map((note, index) => overrides[`base:${index}`] ?? note)
  return [...base, ...loadExtra()]
}

export async function loadNotes(): Promise<Note[]> {
  if (!isDiego()) return []
  const remote = await readVault()
  if (remote?.notes?.length) return remote.notes
  const rows = composeNotes()
  await writeVault({ extra: rows, overrides: {}, notes: rows })
  return rows
}

export async function saveNotes(notes: Note[]) {
  await writeVault({ extra: notes, overrides: {}, notes })
}

export async function confirmGate(password: string): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return hash === GATE_HASH
}

export interface NoteReport {
  total: number
  marked: number
  counts: { label: string; count: number }[]
  years: { year: number; age: number; count: number; marked: number }[]
  peak: { year: number; count: number }
}

export function noteReport(rows: Note[]): NoteReport {
  const counts = [1, 2, 3, null].map((count) => ({
    label: count == null ? 'Sin cifra' : String(count),
    count: rows.filter((row) => row.count === count).length,
  }))
  const byYear = new Map<number, { age: number; count: number; marked: number }>()
  for (const row of rows) {
    const current = byYear.get(row.year) ?? { age: row.age, count: 0, marked: 0 }
    current.count += 1
    if (row.mark) current.marked += 1
    byYear.set(row.year, current)
  }
  const years = Array.from(byYear.entries())
    .map(([year, value]) => ({ year, ...value }))
    .sort((a, b) => a.year - b.year)
  const peak = years.slice().sort((a, b) => b.count - a.count)[0] ?? { year: 0, count: 0 }
  return { total: rows.length, marked: rows.filter((row) => row.mark).length, counts, years, peak }
}

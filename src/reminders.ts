import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { formatCOP } from './money'
import { MONTHS, type DB } from './types'

const LEDGER_KEY = 'cuentas-db-v2'
const TASKS_KEY = 'cuentas-pendientes-v1'
const CHANNEL = 'dia'
const DAYS = 45

interface TaskCard {
  columnId: string
  title: string
  due: string | null
}

interface TaskColumn {
  id: string
  name: string
}

function loadLedger(): DB | null {
  try {
    const raw = localStorage.getItem(LEDGER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DB
    if (!parsed || !Array.isArray(parsed.entries) || !Array.isArray(parsed.periods)) return null
    return parsed
  } catch {
    return null
  }
}

function loadOpenTasks(): TaskCard[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY)
    if (!raw) return []
    const board = JSON.parse(raw) as { cards?: TaskCard[]; columns?: TaskColumn[] }
    const done = new Set((board.columns ?? []).filter((column) => column.name.trim().toLowerCase() === 'hecho').map((column) => column.id))
    return (board.cards ?? []).filter((card) => card.due && card.title.trim() && !done.has(card.columnId))
  } catch {
    return []
  }
}

function linesFor(db: DB, tasks: TaskCard[], date: Date): string[] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()
  const lines: string[] = []
  const period = db.periods.find((item) => item.year === year && item.coveredMonth === month)
  if (period) {
    const last = new Date(year, month + 1, 0).getDate()
    for (const entry of db.entries) {
      if (entry.periodId !== period.id || entry.kind === 'ingreso' || entry.paid || !entry.dueDay || !entry.amount) continue
      if (Math.min(entry.dueDay, last) !== day) continue
      const category = db.categories.find((item) => item.id === entry.categoryId)
      const name = entry.description.trim() || category?.name || 'Pago'
      lines.push(`${name} ${formatCOP(entry.amount)}`)
    }
  }

  const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  for (const card of tasks) {
    if (card.due === iso) lines.push(card.title.trim())
  }
  return lines
}

let timer = 0
let running = false
let again = false
let memory: DB | null = null

export function queueDayAlerts(book?: DB) {
  if (book) memory = book
  if (!Capacitor.isNativePlatform()) return
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    void scheduleDayAlerts()
  }, 500)
}

async function scheduleDayAlerts() {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    const permission = await LocalNotifications.requestPermissions()
    if (permission.display !== 'granted') return
    await LocalNotifications.createChannel({
      id: CHANNEL,
      name: 'Avisos del día',
      description: 'Pagos y pendientes a las 7 a. m.',
      importance: 5,
      visibility: 1,
      vibration: true,
    })

    const db = memory ?? loadLedger()
    if (!db) return
    const tasks = loadOpenTasks()
    const now = new Date()
    const notifications = []
    for (let offset = 0; offset < DAYS; offset += 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
      const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 7, 0, 0, 0)
      if (at.getTime() <= now.getTime()) continue
      const lines = linesFor(db, tasks, date)
      if (!lines.length) continue
      const id = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
      notifications.push({
        id,
        channelId: CHANNEL,
        title: `${date.getDate()} de ${MONTHS[date.getMonth()].toLowerCase()}`,
        body: lines.join(' · '),
        schedule: { at, allowWhileIdle: true },
      })
    }

    const pending = await LocalNotifications.getPending()
    const ours = pending.notifications.filter((item) => item.id >= 20260000 && item.id <= 20320000)
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((item) => ({ id: item.id })) })
    if (notifications.length) await LocalNotifications.schedule({ notifications })
  } catch {
    /* sin permiso de alarmas el aviso no puede programarse */
  } finally {
    running = false
    if (again) {
      again = false
      void scheduleDayAlerts()
    }
  }
}

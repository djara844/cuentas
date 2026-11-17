import { useEffect, useRef, useState } from 'react'
import { isDiego, ledgerId } from './authStore'
import { readBoard, writeBoard } from './cloudLedger'
import { queueDayAlerts } from './reminders'
import { uid } from './types'

export const TASK_COLORS = ['#f43f5e', '#f97316', '#eab308', '#84cc16', '#10b981', '#14b8a6', '#0ea5e9', '#6366f1', '#a855f7', '#d946ef', '#ec4899', '#94a3b8']

export interface TaskCategory {
  id: string
  name: string
  color: string
  sortOrder: number
}

export interface TaskColumn {
  id: string
  name: string
  sortOrder: number
}

export interface TaskCard {
  id: string
  columnId: string
  categoryId: string | null
  title: string
  detail: string
  due: string | null
  sortOrder: number
}

export interface Board {
  categories: TaskCategory[]
  columns: TaskColumn[]
  cards: TaskCard[]
}

const KEY = 'cuentas-pendientes-v1'
const LIST_NAMES = ['Por hacer', 'En curso', 'Hecho']
const OFFICIAL = [
  { name: 'Bienestar', color: '#c084fc' },
  { name: 'Libros', color: '#60a5fa' },
  { name: 'Música', color: '#f472b6' },
  { name: 'Ejercicio', color: '#fb923c' },
  { name: 'Economía', color: '#fbbf24' },
  { name: 'Eventos', color: '#fb7185' },
  { name: 'Varios', color: '#94a3b8' },
]
const RETIRED = new Set(['casa', 'pagos', 'trabajo', 'personal'])

function adoptCategories(board: Board): Board {
  const cards = board.cards.map((card) => ({ ...card, detail: card.detail ?? '', due: card.due ?? null }))
  const names = board.categories.map((category) => category.name.trim().toLowerCase())
  const legacy = names.length > 0 && names.every((name) => RETIRED.has(name))
  if (legacy) {
    const categories = OFFICIAL.map((item, index) => ({ id: uid(), name: item.name, color: item.color, sortOrder: index }))
    return { ...board, categories, cards: cards.map((card) => ({ ...card, categoryId: null })) }
  }
  return { ...board, cards }
}

function lockColumns(board: Board): Board {
  const existing = sorted(board.columns)
  const used = new Set<string>()
  const columns = LIST_NAMES.map((name, index) => {
    const byName = existing.find((column) => column.name.trim().toLowerCase() === name.toLowerCase() && !used.has(column.id))
    const byIndex = existing[index] && !used.has(existing[index].id) ? existing[index] : undefined
    const source = byName ?? byIndex
    const id = source?.id ?? uid()
    used.add(id)
    return { id, name, sortOrder: index }
  })
  const allowed = new Set(columns.map((column) => column.id))
  const fallback = columns[0].id
  return {
    ...board,
    columns,
    cards: board.cards.map((card) => (allowed.has(card.columnId) ? card : { ...card, columnId: fallback })),
  }
}

function seedBoard(): Board {
  return {
    categories: OFFICIAL.map((item, index) => ({ id: uid(), name: item.name, color: item.color, sortOrder: index })),
    columns: [
      { id: uid(), name: 'Por hacer', sortOrder: 0 },
      { id: uid(), name: 'En curso', sortOrder: 1 },
      { id: uid(), name: 'Hecho', sortOrder: 2 },
    ],
    cards: [],
  }
}

function isBoard(value: unknown): value is Board {
  if (!value || typeof value !== 'object') return false
  const board = value as Board
  return Array.isArray(board.categories) && Array.isArray(board.columns) && Array.isArray(board.cards) && board.columns.length > 0
}

function hueOf(color: string): number | null {
  const hex = color.trim().replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null
  const value = Number.parseInt(hex, 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  if (delta < 18) return null
  const hue =
    max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4
  return (hue * 60 + 360) % 360
}

function colorsClash(left: string, right: string) {
  if (left.trim().toLowerCase() === right.trim().toLowerCase()) return true
  const a = hueOf(left)
  const b = hueOf(right)
  if (a == null || b == null) return a == null && b == null
  const gap = Math.abs(a - b)
  return Math.min(gap, 360 - gap) < 28
}

function unusedColor(used: string[]) {
  const open = TASK_COLORS.filter((color) => !used.some((have) => colorsClash(have, color)))
  if (open.length) return open[Math.floor(Math.random() * open.length)]
  for (let step = 0; step < 360; step += 1) {
    const hue = (step * 47) % 360
    const color = hsl(hue, 72, 62)
    if (!used.some((have) => colorsClash(have, color))) return color
  }
  return hsl(Math.floor(Math.random() * 360), 72, 62)
}

function hsl(hue: number, saturation: number, light: number) {
  const s = saturation / 100
  const l = light / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const h = hue / 60
  const x = c * (1 - Math.abs((h % 2) - 1))
  const m = l - c / 2
  const [red, green, blue] =
    h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x]
  const channel = (value: number) => Math.round((value + m) * 255).toString(16).padStart(2, '0')
  return `#${channel(red)}${channel(green)}${channel(blue)}`
}

function separateColors(board: Board): Board {
  const used: string[] = []
  const categories = sorted(board.categories).map((category) => {
    const color = used.some((have) => colorsClash(have, category.color)) ? unusedColor(used) : category.color
    used.push(color)
    return { ...category, color }
  })
  return { ...board, categories }
}

function boardKey() {
  const id = ledgerId()
  return id ? `${KEY}:${id}` : KEY
}

function loadBoard(): Board {
  try {
    const raw = localStorage.getItem(boardKey()) || (isDiego() ? localStorage.getItem(KEY) : null)
    if (!raw) return placeVarios(separateColors(seedBoard()))
    const parsed = JSON.parse(raw) as unknown
    return placeVarios(separateColors(isBoard(parsed) ? adoptCategories(lockColumns(parsed)) : seedBoard()))
  } catch {
    return placeVarios(separateColors(seedBoard()))
  }
}

function sorted<T extends { sortOrder: number }>(items: T[]): T[] {
  return items.slice().sort((a, b) => a.sortOrder - b.sortOrder)
}

function isVarios(category: { name: string }) {
  return category.name.trim().toLowerCase() === 'varios'
}

function pinVarios(categories: TaskCategory[]): TaskCategory[] {
  const ordered = sorted(categories)
  const tail = ordered.filter(isVarios)
  const head = ordered.filter((category) => !isVarios(category))
  return [...head, ...tail].map((category, index) => ({ ...category, sortOrder: index }))
}

function placeVarios(board: Board): Board {
  const categories = board.categories.some(isVarios)
    ? pinVarios(board.categories)
    : pinVarios([
        ...board.categories,
        { id: uid(), name: 'Varios', color: unusedColor(board.categories.map((category) => category.color)), sortOrder: board.categories.length },
      ])
  return { ...board, categories }
}

function remember(board: Board) {
  void writeBoard(board).then((ok) => {
    if (ok) localStorage.setItem(boardKey(), JSON.stringify(board))
    queueDayAlerts()
  })
}

function normalizeBoard(board: Board): Board {
  return placeVarios(separateColors(isBoard(board) ? adoptCategories(lockColumns(board)) : seedBoard()))
}

export function useBoard() {
  const [board, setBoard] = useState<Board>(loadBoard)
  const live = useRef(board)
  live.current = board

  useEffect(() => {
    let cancel = false
    void (async () => {
      if (!isDiego()) return
      const remote = await readBoard()
      if (cancel) return
      const local = live.current
      const remoteHas = !!remote && (remote.cards.length > 0 || local.cards.length === 0)
      const next = normalizeBoard(remoteHas && remote ? remote : local)
      if (!remoteHas && local.cards.length > 0) await writeBoard(next)
      if (!cancel) setBoard(next)
    })()
    return () => {
      cancel = true
    }
  }, [])

  function patch(recipe: (current: Board) => Board) {
    setBoard((current) => {
      const next = placeVarios(lockColumns(recipe(current)))
      remember(next)
      return next
    })
  }

  return {
    categories: sorted(board.categories),
    columns: sorted(board.columns),
    cards: sorted(board.cards),
    addCategory(name: string, color?: string) {
      const label = name.trim()
      if (!label) return
      patch((current) => {
        if (isVarios({ name: label })) return current
        const used = current.categories.map((category) => category.color)
        const next = color && !used.some((have) => colorsClash(have, color)) ? color : unusedColor(used)
        return {
          ...current,
          categories: [...current.categories, { id: uid(), name: label, color: next, sortOrder: current.categories.length }],
        }
      })
    },
    updateCategory(id: string, next: Partial<Pick<TaskCategory, 'name' | 'color'>>) {
      patch((current) => ({
        ...current,
        categories: current.categories.map((category) => {
          if (category.id !== id) return category
          if (isVarios(category)) return { ...category, color: next.color ?? category.color }
          return { ...category, ...next }
        }),
      }))
    },
    recolorCategory(id: string) {
      patch((current) => ({
        ...current,
        categories: current.categories.map((category) =>
          category.id === id
            ? { ...category, color: unusedColor(current.categories.filter((item) => item.id !== id).map((item) => item.color)) }
            : category,
        ),
      }))
    },
    moveCategory(id: string, direction: -1 | 1) {
      patch((current) => {
        const categories = sorted(current.categories)
        const index = categories.findIndex((category) => category.id === id)
        const target = index + direction
        const moving = categories[index]
        const neighbor = categories[target]
        if (!moving || index < 0 || target < 0 || target >= categories.length || isVarios(moving) || (neighbor && isVarios(neighbor))) return current
        const next = categories.slice()
        const [item] = next.splice(index, 1)
        next.splice(target, 0, item)
        return { ...current, categories: next.map((category, order) => ({ ...category, sortOrder: order })) }
      })
    },
    removeCategory(id: string) {
      patch((current) => {
        const target = current.categories.find((category) => category.id === id)
        const varios = current.categories.find(isVarios)
        if (!target || !varios || target.id === varios.id) return current
        return {
          ...current,
          categories: current.categories.filter((category) => category.id !== id),
          cards: current.cards.map((card) => (card.categoryId === id ? { ...card, categoryId: varios.id } : card)),
        }
      })
    },
    addCard(input: { columnId: string; categoryId: string | null; title: string; detail: string; due: string | null }) {
      const title = input.title.trim()
      if (!title) return
      patch((current) => {
        const siblings = current.cards.filter((card) => card.columnId === input.columnId)
        const sortOrder = siblings.reduce((max, card) => Math.max(max, card.sortOrder), -1) + 1
        return {
          ...current,
          cards: [
            ...current.cards,
            {
              id: uid(),
              columnId: input.columnId,
              categoryId: input.categoryId,
              title,
              detail: input.detail.trim(),
              due: input.due,
              sortOrder,
            },
          ],
        }
      })
    },
    updateCard(id: string, next: Partial<Pick<TaskCard, 'title' | 'detail' | 'due' | 'categoryId' | 'columnId'>>) {
      patch((current) => ({
        ...current,
        cards: current.cards.map((card) => {
          if (card.id !== id) return card
          const columnId = next.columnId ?? card.columnId
          const moved = columnId !== card.columnId
          const sortOrder = moved
            ? current.cards.filter((item) => item.columnId === columnId).reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
            : card.sortOrder
          return {
            ...card,
            ...next,
            title: next.title === undefined ? card.title : next.title,
            detail: next.detail === undefined ? card.detail : next.detail,
            columnId,
            sortOrder,
          }
        }),
      }))
    },
    moveCard(id: string, columnId: string) {
      patch((current) => ({
        ...current,
        cards: current.cards.map((card) => {
          if (card.id !== id || card.columnId === columnId) return card
          const sortOrder = current.cards.filter((item) => item.columnId === columnId).reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
          return { ...card, columnId, sortOrder }
        }),
      }))
    },
    removeCard(id: string) {
      patch((current) => ({ ...current, cards: current.cards.filter((card) => card.id !== id) }))
    },
  }
}

import { useEffect, useState } from 'react'
import { queueDayAlerts } from './reminders'
import { uid } from './types'

export const TASK_COLORS = ['#38bdf8', '#22d3ee', '#818cf8', '#c084fc', '#f472b6', '#fb7185', '#fb923c', '#fbbf24', '#2dd4bf', '#60a5fa', '#a78bfa', '#94a3b8']

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
  const legacy = names.length === 0 || names.every((name) => RETIRED.has(name))
  if (legacy) {
    const categories = OFFICIAL.map((item, index) => ({ id: uid(), name: item.name, color: item.color, sortOrder: index }))
    return { ...board, categories, cards: cards.map((card) => ({ ...card, categoryId: null })) }
  }
  const have = new Set(names)
  const missing = OFFICIAL.filter((item) => !have.has(item.name.toLowerCase()))
  if (missing.length === 0) return { ...board, cards }
  return {
    ...board,
    cards,
    categories: [
      ...board.categories,
      ...missing.map((item, index) => ({
        id: uid(),
        name: item.name,
        color: item.color,
        sortOrder: board.categories.length + index,
      })),
    ],
  }
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

function loadBoard(): Board {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return seedBoard()
    const parsed = JSON.parse(raw) as unknown
    return isBoard(parsed) ? adoptCategories(lockColumns(parsed)) : seedBoard()
  } catch {
    return seedBoard()
  }
}

function sorted<T extends { sortOrder: number }>(items: T[]): T[] {
  return items.slice().sort((a, b) => a.sortOrder - b.sortOrder)
}

export function useBoard() {
  const [board, setBoard] = useState<Board>(loadBoard)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(board))
    queueDayAlerts()
  }, [board])

  function patch(recipe: (current: Board) => Board) {
    setBoard((current) => lockColumns(recipe(current)))
  }

  return {
    categories: sorted(board.categories),
    columns: sorted(board.columns),
    cards: sorted(board.cards),
    addCategory(name: string, color: string) {
      const label = name.trim()
      if (!label) return
      patch((current) => ({
        ...current,
        categories: [
          ...current.categories,
          { id: uid(), name: label, color, sortOrder: current.categories.length },
        ],
      }))
    },
    updateCategory(id: string, next: Partial<Pick<TaskCategory, 'name' | 'color'>>) {
      patch((current) => ({
        ...current,
        categories: current.categories.map((category) => (category.id === id ? { ...category, ...next } : category)),
      }))
    },
    removeCategory(id: string) {
      patch((current) => ({
        ...current,
        categories: current.categories.filter((category) => category.id !== id),
        cards: current.cards.map((card) => (card.categoryId === id ? { ...card, categoryId: null } : card)),
      }))
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

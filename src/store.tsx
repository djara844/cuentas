import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
import { readCloud, writeCloud } from './cloudLedger'
import { loadMeta, noteDeleted, saveMeta, type SyncMeta } from './syncBook'
import type { Category, DB, Debt, Entry, Kind, Period, Projection, Template } from './types'
import { instantiateTemplates, isDB, periodLabel, planDebt, planSpan, sortOrderFor, templateCovers, uid } from './types'
import { buildSeed, paintedColor } from './seed'
import {
  authMessage,
  deleteCategory as remoteDeleteCategory,
  deleteEntry as remoteDeleteEntry,
  deletePeriod as remoteDeletePeriod,
  fetchDB,
  makeClient,
  readConfig,
  replaceDB,
  upsertCategory,
  upsertEntry,
  upsertPeriod,
  upsertTemplate,
  deleteTemplate as remoteDeleteTemplate,
  writeConfig,
  type SupabaseConfig,
} from './remote'

const STORAGE_KEY = 'cuentas-db-v2'

function projectionOf(value: Projection | undefined): Projection | undefined {
  if (!value) return undefined
  const { fromYear, fromMonth, toYear, toMonth } = value
  if (![fromYear, fromMonth, toYear, toMonth].every((item) => Number.isInteger(item))) return undefined
  if (fromMonth < 0 || fromMonth > 11 || toMonth < 0 || toMonth > 11) return undefined
  if (toYear * 12 + toMonth < fromYear * 12 + fromMonth) return undefined
  return { fromYear, fromMonth, toYear, toMonth }
}

function normalize(db: DB): DB {
  const projection = projectionOf(db.projection)
  return {
    ...db,
    projection,
    templates: Array.isArray(db.templates) ? db.templates : [],
    categories: db.categories.map((category) => ({ ...category, color: paintedColor(category.id, category.color) })),
    entries: db.entries.map((entry) => ({
      ...entry,
      templateId: entry.templateId ?? null,
      paid: Boolean(entry.paid),
      dueDay: typeof entry.dueDay === 'number' && entry.dueDay >= 1 ? Math.min(31, Math.round(entry.dueDay)) : null,
      termId: entry.termId ?? null,
      termTotal: typeof entry.termTotal === 'number' ? entry.termTotal : null,
      termIndex: typeof entry.termIndex === 'number' ? entry.termIndex : null,
      debtId: entry.debtId ?? null,
      advance: Boolean(entry.advance),
    })),
    debts: Array.isArray(db.debts)
      ? db.debts.map((debt) => ({
          ...debt,
          total: Math.round(Number(debt.total) || 0),
          cuota: Math.round(Number(debt.cuota) || 0),
          categoryId: debt.categoryId ?? null,
        }))
      : [],
  }
}

const REPLACED_CUOTA = /cuota\s+(teresita|tonello)/i

function withoutReplacedCuota(db: DB): DB {
  const dropTemplates = new Set(db.templates.filter((item) => REPLACED_CUOTA.test(item.description)).map((item) => item.id))
  const entries = db.entries.filter((entry) => !(entry.templateId && dropTemplates.has(entry.templateId)) && !REPLACED_CUOTA.test(entry.description))
  const templates = db.templates.filter((item) => !dropTemplates.has(item.id))
  if (entries.length === db.entries.length && templates.length === db.templates.length) return db
  return { ...db, entries, templates }
}

function prepareBook(db: DB): DB {
  return balanceDebts(withoutReplacedCuota(withoutDuplicateDebts(normalize(db))))
}

function monthKey(periods: Period[], periodId: string) {
  const period = periods.find((item) => item.id === periodId)
  return period ? period.year * 100 + period.coveredMonth : 0
}

function debtSpan(debt: Debt, periods: Period[], entries: Entry[]) {
  if (typeof debt.months === 'number' && debt.months > 0) return Math.min(36, debt.months)
  const start = debt.startYear * 12 + debt.startMonth
  let last = start
  for (const entry of entries) {
    if (entry.debtId !== debt.id || entry.advance) continue
    const period = periods.find((item) => item.id === entry.periodId)
    if (!period) continue
    last = Math.max(last, period.year * 12 + period.coveredMonth)
  }
  return Math.max(1, Math.min(36, last - start + 1))
}

function balanceDebts(db: DB): DB {
  let entries = db.entries
  let changed = false
  for (const debt of db.debts ?? []) {
    const sum = entries.filter((entry) => entry.debtId === debt.id).reduce((total, entry) => total + entry.amount, 0)
    const delta = sum - debt.total
    if (!delta) continue
    entries = shiftLastCuota(entries, db.periods, debt.id, delta)
    changed = true
  }
  return changed ? { ...db, entries } : db
}

function shiftLastCuota(entries: Entry[], periods: Period[], debtId: string, delta: number, skipId?: string): Entry[] {
  if (!delta) return entries
  const cuotas = entries
    .filter((entry) => entry.debtId === debtId && !entry.advance && entry.id !== skipId)
    .sort((a, b) => monthKey(periods, a.periodId) - monthKey(periods, b.periodId))
    .map((entry) => ({ ...entry }))
  if (!cuotas.length) return entries
  if (delta > 0) {
    let left = delta
    for (let index = cuotas.length - 1; index >= 0 && left > 0; index -= 1) {
      if (cuotas[index].paid) continue
      const cut = Math.min(cuotas[index].amount, left)
      cuotas[index] = { ...cuotas[index], amount: cuotas[index].amount - cut }
      left -= cut
    }
  } else {
    const fromEnd = [...cuotas].reverse().findIndex((entry) => !entry.paid)
    const target = fromEnd < 0 ? cuotas.length - 1 : cuotas.length - 1 - fromEnd
    cuotas[target] = { ...cuotas[target], amount: cuotas[target].amount + -delta }
  }
  const removed = cuotas.filter((entry) => entry.amount <= 0).map((entry) => entry.id)
  if (removed.length) noteDeleted('entries', removed)
  const kept = cuotas
    .filter((entry) => entry.amount > 0)
    .map((entry, index, list) => ({ ...entry, termIndex: index + 1, termTotal: list.length }))
  const ids = new Set(cuotas.map((entry) => entry.id))
  return [...entries.filter((entry) => !ids.has(entry.id)), ...kept]
}

function withoutDuplicateDebts(db: DB): DB {
  const seen = new Set<string>()
  const drop = new Set<string>()
  for (const debt of db.debts) {
    const key = debt.name.trim().toLowerCase()
    if (seen.has(key)) drop.add(debt.id)
    else seen.add(key)
  }
  if (!drop.size) return db
  return {
    ...db,
    debts: db.debts.filter((debt) => !drop.has(debt.id)),
    entries: db.entries.filter((entry) => !entry.debtId || !drop.has(entry.debtId)),
  }
}

function loadLocal(): DB | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return isDB(parsed) ? normalize(parsed) : null
  } catch {
    return null
  }
}

interface Store {
  ready: boolean
  db: DB
  mode: 'local' | 'supabase' | 'neon'
  email: string | null
  needsAuth: boolean
  error: string | null
  clearError: () => void
  addCategory: (input: { name: string; kind: Kind; color: string }) => Category
  updateCategory: (id: string, patch: Partial<Pick<Category, 'name' | 'color' | 'sortOrder'>>) => void
  removeCategory: (id: string) => void
  addPeriod: (input: { label: string; year: number; coveredMonth: number; copyFrom?: string; keepAmounts?: boolean }) => Period
  updatePeriod: (id: string, patch: Partial<Pick<Period, 'label'>>) => void
  removePeriod: (id: string) => void
  ensureYear: (year: number) => Period[]
  setProjection: (range: Projection) => void
  addEntry: (input: { periodId: string; kind: Kind; description?: string; categoryId?: string | null; amount?: number; paid?: boolean; dueDay?: number | null; debtId?: string | null; advance?: boolean }) => Entry
  addDebtAdvance: (input: { periodId: string; debtId: string; description: string; categoryId: string | null; amount: number; paid?: boolean; dueDay?: number | null }) => void
  updateEntry: (id: string, patch: Partial<Pick<Entry, 'description' | 'amount' | 'categoryId' | 'paid' | 'dueDay' | 'debtId' | 'advance'>>) => void
  setDebtPayment: (debtId: string, periodId: string, amount: number) => void
  addDebt: (input: { name: string; total: number; cuota: number; categoryId: string | null; startPeriodId: string; months: number }) => string
  updateDebt: (id: string, input: { name: string; total: number; cuota: number; categoryId: string | null; startPeriodId: string; months: number }) => void
  removeDebt: (id: string) => void
  addTerm: (input: { periodId: string; kind: Kind; description: string; categoryId?: string | null; amount: number; startDate: string; months: number }) => string
  removeEntry: (id: string) => void
  addTemplate: (input: { kind: Kind; description: string; amount: number; categoryId?: string | null; startYear?: number | null; startMonth?: number | null; months?: number | null }) => { template: Template; entries: Entry[] }
  updateTemplate: (id: string, patch: Partial<Pick<Template, 'description' | 'amount' | 'categoryId' | 'kind' | 'startYear' | 'startMonth' | 'months'>>) => void
  applyTemplateAmount: (id: string) => void
  removeTemplate: (id: string) => void
  importDB: (db: DB) => void
  resetSeed: () => void
  connect: (config: SupabaseConfig) => Promise<void>
  disconnect: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('Store fuera de alcance')
  return ctx
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>({ categories: [], periods: [], entries: [], templates: [], debts: [] })
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<'local' | 'supabase' | 'neon'>('local')
  const [email, setEmail] = useState<string | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dbRef = useRef(db)
  const cloud = useRef(false)
  const syncQueued = useRef(false)
  const clientRef = useRef<SupabaseClient | null>(null)
  const userRef = useRef<string | null>(null)
  const timers = useRef<Record<string, number>>({})

  dbRef.current = db

  function report(err: unknown) {
    const message = err instanceof Error ? err.message : 'No se pudo guardar en la base de datos.'
    const text = message.toLowerCase()
    if (text.includes('fetch') || text.includes('network') || text.includes('neon')) {
      setError('No se pudo guardar en la base de datos. Se vuelve a intentar solo.')
      return
    }
    setError(`${authMessage(message)} No se pudo guardar en la base de datos.`)
  }

  async function remote(task: (sb: SupabaseClient, userId: string) => Promise<void>) {
    const sb = clientRef.current
    const userId = userRef.current
    if (!sb || !userId) return
    try {
      await task(sb, userId)
    } catch (err) {
      report(err)
    }
  }

  function showBook(next: DB, meta: SyncMeta) {
    const normalized = prepareBook(next)
    dbRef.current = normalized
    setDb(normalized)
    saveMeta({ ...meta, dirty: false, provisional: false })
    if (!readConfig()) setMode('neon')
  }

  const saving = useRef(0)

  function commit(recipe: (current: DB) => DB) {
    const next = balanceDebts(recipe(dbRef.current))
    dbRef.current = next
    setDb(next)
    if (readConfig()) return next
    setMode('neon')
    saving.current += 1
    void writeCloud(next)
      .then((updatedAt) => {
        if (updatedAt == null) {
          setError('No se pudo guardar en la base de datos.')
          return
        }
        setError(null)
        saveMeta({
          revision: updatedAt,
          dirty: false,
          provisional: false,
          deleted: { categories: [], periods: [], entries: [], templates: [], debts: [] },
        })
      })
      .finally(() => {
        saving.current -= 1
      })
    return next
  }

  async function reconcile() {
    if (readConfig() || !navigator.onLine || saving.current > 0) return
    if (cloud.current) {
      syncQueued.current = true
      return
    }
    cloud.current = true
    try {
      const remote = await readCloud()
      if (remote.status !== 'ok') {
        setError('No se pudo leer la base de datos.')
        return
      }
      const meta = loadMeta()
      if (remote.updatedAt !== meta.revision) {
        showBook(remote.db, {
          revision: remote.updatedAt,
          dirty: false,
          provisional: false,
          deleted: { categories: [], periods: [], entries: [], templates: [], debts: [] },
        })
      } else setMode('neon')
    } finally {
      cloud.current = false
      if (syncQueued.current) {
        syncQueued.current = false
        void reconcile()
      }
    }
  }

  async function adopt(sb: SupabaseClient, session: Session) {
    const userId = session.user.id
    clientRef.current = sb
    userRef.current = userId
    setEmail(session.user.email ?? null)
    setMode('supabase')
    setNeedsAuth(false)
    const remoteDb = await fetchDB(sb, userId)
    if (remoteDb.periods.length === 0) {
      const local = loadLocal() ?? buildSeed()
      await replaceDB(sb, userId, local)
      dbRef.current = local
      setDb(local)
    } else {
      dbRef.current = remoteDb
      setDb(remoteDb)
    }
  }

  useEffect(() => {
    const onOnline = () => {
      void reconcile()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reconcile()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('focus', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    let removeResume: (() => void) | undefined
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void reconcile()
      }).then((handle) => {
        removeResume = () => {
          void handle.remove()
        }
      })
    }
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('focus', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      removeResume?.()
    }
    // reconcile closes over the latest setters and stays stable for the lifetime of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const config = readConfig()
        if (!config) {
          if (!navigator.onLine) {
            setError('Sin conexión. Los datos están en la base de datos.')
            setReady(true)
            return
          }
          const remote = await readCloud()
          if (cancel) return
          if (remote.status === 'ok') {
            showBook(normalize(remote.db), {
              revision: remote.updatedAt,
              dirty: false,
              provisional: false,
              deleted: { categories: [], periods: [], entries: [], templates: [], debts: [] },
            })
            setError(null)
            setReady(true)
            return
          }
          setError(remote.status === 'empty' ? 'No se pudo abrir la base de datos.' : 'No se pudo leer la base de datos.')
          setReady(true)
          return
        }
        const sb = makeClient(config)
        const { data, error: sessionError } = await sb.auth.getSession()
        if (sessionError) throw sessionError
        if (!data.session) {
          if (!cancel) {
            clientRef.current = sb
            const initial = buildSeed()
            dbRef.current = initial
            setDb(initial)
            setNeedsAuth(true)
            setMode('supabase')
            setReady(true)
          }
          return
        }
        await adopt(sb, data.session)
        if (!cancel) setReady(true)
      } catch (err) {
        if (cancel) return
        const initial = loadLocal() ?? buildSeed()
        dbRef.current = initial
        setDb(initial)
        setMode('local')
        setReady(true)
        setError(authMessage(err instanceof Error ? err.message : 'No se pudo abrir la base de datos.'))
      }
    })()
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const api = useMemo<Store>(() => {
    return {
      ready,
      db,
      mode,
      email,
      needsAuth,
      error,
      clearError: () => setError(null),
      addCategory: ({ name, kind, color }) => {
        const category: Category = {
          id: uid(),
          name: name.trim(),
          kind,
          color,
          sortOrder: dbRef.current.categories.filter((c) => c.kind === kind).length,
        }
        commit((current) => ({ ...current, categories: [...current.categories, category] }))
        void remote((sb, userId) => upsertCategory(sb, userId, category))
        return category
      },
      updateCategory: (id, patch) => {
        let updated: Category | undefined
        commit((current) => ({
          ...current,
          categories: current.categories.map((c) => {
            if (c.id !== id) return c
            updated = { ...c, ...patch }
            return updated
          }),
        }))
        if (updated) {
          const category = updated
          window.clearTimeout(timers.current[id])
          timers.current[id] = window.setTimeout(() => {
            void remote((sb, userId) => upsertCategory(sb, userId, category))
          }, 350)
        }
      },
      removeCategory: (id) => {
        noteDeleted('categories', [id])
        const affected = dbRef.current.entries.filter((e) => e.categoryId === id).map((e) => ({ ...e, categoryId: null }))
        commit((current) => ({
          ...current,
          categories: current.categories.filter((c) => c.id !== id),
          entries: current.entries.map((e) => (e.categoryId === id ? { ...e, categoryId: null } : e)),
        }))
        void remote(async (sb, userId) => {
          await remoteDeleteCategory(sb, id)
          for (const entry of affected) await upsertEntry(sb, userId, entry)
        })
      },
      addPeriod: ({ label, year, coveredMonth, copyFrom, keepAmounts }) => {
        const period: Period = {
          id: uid(),
          label: label.trim() || 'Nuevo periodo',
          year,
          coveredMonth,
          sortOrder: sortOrderFor(year, coveredMonth),
        }
        const source = copyFrom ? dbRef.current.entries.filter((e) => e.periodId === copyFrom) : []
        const entries = copyFrom
          ? source.map((e, index) => ({
              ...e,
              id: uid(),
              periodId: period.id,
              amount: keepAmounts ? e.amount : 0,
              sortOrder: e.sortOrder ?? index,
            }))
          : instantiateTemplates(period.id, dbRef.current.templates, { year, month: coveredMonth })
        commit((current) => ({
          ...current,
          periods: [...current.periods, period],
          entries: [...current.entries, ...entries],
        }))
        void remote(async (sb, userId) => {
          await upsertPeriod(sb, userId, period)
          if (entries.length) {
            for (const entry of entries) await upsertEntry(sb, userId, entry)
          }
        })
        return period
      },
      updatePeriod: (id, patch) => {
        let updated: Period | undefined
        commit((current) => ({
          ...current,
          periods: current.periods.map((p) => {
            if (p.id !== id) return p
            updated = { ...p, ...patch }
            return updated
          }),
        }))
        if (updated) {
          const period = updated
          window.clearTimeout(timers.current[id])
          timers.current[id] = window.setTimeout(() => {
            void remote((sb, userId) => upsertPeriod(sb, userId, period))
          }, 350)
        }
      },
      removePeriod: (id) => {
        noteDeleted('periods', [id])
        noteDeleted(
          'entries',
          dbRef.current.entries.filter((entry) => entry.periodId === id).map((entry) => entry.id),
        )
        commit((current) => ({
          ...current,
          periods: current.periods.filter((p) => p.id !== id),
          entries: current.entries.filter((e) => e.periodId !== id),
        }))
        void remote((sb) => remoteDeletePeriod(sb, id))
      },
      ensureYear: (year) => {
        const existing = dbRef.current.periods.filter((p) => p.year === year)
        const have = new Set(existing.map((p) => p.coveredMonth))
        const created: Period[] = []
        const entries: Entry[] = []
        for (let month = 0; month < 12; month++) {
          if (have.has(month)) continue
          const period: Period = {
            id: uid(),
            label: periodLabel(year, month),
            year,
            coveredMonth: month,
            sortOrder: sortOrderFor(year, month),
          }
          created.push(period)
          entries.push(...instantiateTemplates(period.id, dbRef.current.templates, { year, month }))
        }
        const months = [...existing, ...created].sort((a, b) => a.coveredMonth - b.coveredMonth)
        if (!created.length) return months
        commit((current) => ({
          ...current,
          periods: [...current.periods, ...created],
          entries: [...current.entries, ...entries],
        }))
        void remote(async (sb, userId) => {
          for (const period of created) await upsertPeriod(sb, userId, period)
          for (const entry of entries) await upsertEntry(sb, userId, entry)
        })
        return months
      },
      setProjection: (range) => {
        const today = new Date()
        const now = today.getFullYear() * 12 + today.getMonth()
        const min = (today.getFullYear() - 10) * 12
        const max = (today.getFullYear() + 3) * 12 + 11
        const from = Math.max(min, Math.min(now, range.fromYear * 12 + range.fromMonth))
        const to = Math.max(now, Math.min(max, range.toYear * 12 + range.toMonth))
        const projection: Projection = {
          fromYear: Math.floor(from / 12),
          fromMonth: from % 12,
          toYear: Math.floor(to / 12),
          toMonth: to % 12,
        }
        const current = dbRef.current
        const saved = current.projection
        const same =
          saved?.fromYear === projection.fromYear &&
          saved.fromMonth === projection.fromMonth &&
          saved.toYear === projection.toYear &&
          saved.toMonth === projection.toMonth
        const have = new Set(current.periods.map((period) => period.year * 12 + period.coveredMonth))
        const created: Period[] = []
        const entries: Entry[] = []
        for (let cursor = from; cursor <= to; cursor++) {
          if (have.has(cursor)) continue
          const year = Math.floor(cursor / 12)
          const month = cursor % 12
          const period: Period = {
            id: uid(),
            label: periodLabel(year, month),
            year,
            coveredMonth: month,
            sortOrder: sortOrderFor(year, month),
          }
          created.push(period)
          if (cursor > now) entries.push(...instantiateTemplates(period.id, current.templates, { year, month }))
        }
        if (same && !created.length) return
        commit((book) => ({
          ...book,
          projection,
          periods: [...book.periods, ...created],
          entries: [...book.entries, ...entries],
        }))
        void remote(async (sb, userId) => {
          for (const period of created) await upsertPeriod(sb, userId, period)
          for (const entry of entries) await upsertEntry(sb, userId, entry)
        })
      },
      addEntry: ({ periodId, kind, description = '', categoryId = null, amount = 0, paid = false, dueDay = null, debtId = null, advance = false }) => {
        const siblings = dbRef.current.entries.filter((e) => e.periodId === periodId && e.kind === kind)
        const entry: Entry = {
          id: uid(),
          periodId,
          categoryId,
          kind,
          description,
          amount,
          sortOrder: siblings.reduce((m, e) => Math.max(m, e.sortOrder + 1), 0),
          templateId: null,
          paid,
          dueDay,
          termId: null,
          termTotal: null,
          termIndex: null,
          debtId: advance ? debtId : null,
          advance: Boolean(advance && debtId),
        }
        commit((current) => ({ ...current, entries: [...current.entries, entry] }))
        void remote((sb, userId) => upsertEntry(sb, userId, entry))
        return entry
      },
      addDebtAdvance: ({ periodId, debtId, description, categoryId, amount, paid = false, dueDay = null }) => {
        const debt = (dbRef.current.debts ?? []).find((item) => item.id === debtId)
        const value = Math.max(0, Math.round(amount))
        if (!debt || value <= 0) return
        commit((current) => {
          const advance: Entry = {
            id: uid(),
            periodId,
            categoryId: categoryId || debt.categoryId,
            kind: 'gasto',
            description: description.trim() || debt.name,
            amount: value,
            sortOrder: 90,
            templateId: null,
            paid,
            dueDay,
            termId: null,
            termTotal: null,
            termIndex: null,
            debtId: debt.id,
            advance: true,
          }
          return { ...current, entries: shiftLastCuota([...current.entries, advance], current.periods, debt.id, value) }
        })
      },
      updateEntry: (id, patch) => {
        const currentEntry = dbRef.current.entries.find((entry) => entry.id === id)
        let updated: Entry | undefined
        commit((current) => {
          let entries = current.entries.map((e) => {
            if (e.id === id) {
              updated = { ...e, ...patch }
              return updated
            }
            if (patch.dueDay !== undefined && currentEntry?.termId && e.termId === currentEntry.termId) {
              return { ...e, dueDay: patch.dueDay }
            }
            return e
          })
          if (currentEntry?.debtId && patch.amount != null && Math.round(patch.amount) !== currentEntry.amount) {
            entries = shiftLastCuota(entries, current.periods, currentEntry.debtId, Math.round(patch.amount) - currentEntry.amount, currentEntry.advance ? undefined : currentEntry.id)
          }
          return { ...current, entries }
        })
        if (updated) {
          const entry = updated
          window.clearTimeout(timers.current[id])
          timers.current[id] = window.setTimeout(() => {
            void remote((sb, userId) => upsertEntry(sb, userId, entry))
          }, 250)
        }
      },
      setDebtPayment: (debtId, periodId, amount) => {
        const debt = (dbRef.current.debts ?? []).find((item) => item.id === debtId)
        if (!debt) return
        const paidAmount = Math.max(0, Math.round(amount))
        const removed: string[] = []
        commit((current) => {
          const cuotas = current.entries
            .filter((entry) => entry.debtId === debtId && !entry.advance)
            .sort((a, b) => (a.termIndex ?? 0) - (b.termIndex ?? 0))
          const index = cuotas.findIndex((entry) => entry.periodId === periodId)
          if (index < 0) return current
          const advances = current.entries
            .filter((entry) => entry.debtId === debtId && entry.advance)
            .reduce((sum, entry) => sum + entry.amount, 0)
          const target = Math.max(0, debt.total - advances)
          const next = cuotas.map((entry) => ({ ...entry }))
          next[index] = { ...next[index], amount: paidAmount, paid: true }
          let delta = next.reduce((sum, entry) => sum + entry.amount, 0) - target
          let extraPeriod: Period | null = null
          if (delta > 0) {
            for (let cursor = next.length - 1; cursor >= 0 && delta > 0; cursor -= 1) {
              if (cursor === index) continue
              const cut = Math.min(next[cursor].amount, delta)
              next[cursor] = { ...next[cursor], amount: next[cursor].amount - cut }
              delta -= cut
            }
            if (delta > 0) next[index] = { ...next[index], amount: Math.max(0, next[index].amount - delta) }
          } else if (delta < 0) {
            const need = -delta
            if (index !== next.length - 1) {
              const last = next.length - 1
              next[last] = { ...next[last], amount: next[last].amount + need }
            } else {
              const period = current.periods.find((item) => item.id === periodId)
              if (period) {
                const date = new Date(period.year, period.coveredMonth + 1, 1)
                const year = date.getFullYear()
                const month = date.getMonth()
                extraPeriod =
                  current.periods.find((item) => item.year === year && item.coveredMonth === month) ?? {
                    id: uid(),
                    label: periodLabel(year, month),
                    year,
                    coveredMonth: month,
                    sortOrder: sortOrderFor(year, month),
                  }
                next.push({
                  id: uid(),
                  periodId: extraPeriod.id,
                  categoryId: debt.categoryId,
                  kind: 'gasto',
                  description: debt.name,
                  amount: need,
                  sortOrder: 80,
                  templateId: null,
                  paid: false,
                  dueDay: null,
                  termId: debt.id,
                  termTotal: next.length + 1,
                  termIndex: next.length + 1,
                  debtId: debt.id,
                  advance: false,
                })
              }
            }
          }
          const editedId = cuotas[index].id
          const kept = next.filter((entry) => entry.amount > 0 || entry.id === editedId)
          removed.push(...next.filter((entry) => !kept.includes(entry) && cuotas.some((item) => item.id === entry.id)).map((entry) => entry.id))
          const numbered = kept.map((entry, cursor) => ({
            ...entry,
            termId: debt.id,
            termIndex: cursor + 1,
            termTotal: kept.length,
          }))
          const oldIds = new Set(cuotas.map((entry) => entry.id))
          if (removed.length) noteDeleted('entries', removed)
          return {
            ...current,
            periods: extraPeriod && !current.periods.some((item) => item.id === extraPeriod.id) ? [...current.periods, extraPeriod] : current.periods,
            entries: [...current.entries.filter((entry) => !oldIds.has(entry.id)), ...numbered],
          }
        })
      },
      removeEntry: (id) => {
        const entry = dbRef.current.entries.find((item) => item.id === id)
        noteDeleted('entries', [id])
        commit((current) => {
          let entries = current.entries.filter((item) => item.id !== id)
          if (entry?.advance && entry.debtId && entry.amount > 0) {
            entries = shiftLastCuota(entries, current.periods, entry.debtId, -entry.amount)
          }
          return { ...current, entries }
        })
        void remote((sb) => remoteDeleteEntry(sb, id))
      },
      addTerm: ({ periodId, kind, description, categoryId = null, amount, startDate, months }) => {
        const opened = dbRef.current.periods.find((period) => period.id === periodId)
        const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate)
        const startYear = parsed ? Number(parsed[1]) : opened?.year
        const startMonth = parsed ? Number(parsed[2]) - 1 : opened?.coveredMonth
        const day = parsed ? Math.min(31, Math.max(1, Number(parsed[3]))) : 1
        const count = Math.max(1, Math.min(24, Math.round(months) || 1))
        if (startYear == null || startMonth == null || startMonth < 0 || startMonth > 11) return ''
        const years = new Set<number>()
        for (let index = 0; index < count; index++) years.add(new Date(startYear, startMonth + index, 1).getFullYear())
        const createdPeriods: Period[] = []
        const carried: Entry[] = []
        for (const year of years) {
          const have = new Set(dbRef.current.periods.filter((period) => period.year === year).map((period) => period.coveredMonth))
          for (const period of createdPeriods) if (period.year === year) have.add(period.coveredMonth)
          for (let month = 0; month < 12; month++) {
            if (have.has(month)) continue
            const period: Period = {
              id: uid(),
              label: periodLabel(year, month),
              year,
              coveredMonth: month,
              sortOrder: sortOrderFor(year, month),
            }
            createdPeriods.push(period)
            carried.push(...instantiateTemplates(period.id, dbRef.current.templates, { year: period.year, month: period.coveredMonth }))
          }
        }
        const periods = [...dbRef.current.periods, ...createdPeriods]
        const termId = uid()
        const name = description.trim()
        const created: Entry[] = []
        for (let index = 0; index < count; index++) {
          const date = new Date(startYear, startMonth + index, 1)
          const period = periods.find((item) => item.year === date.getFullYear() && item.coveredMonth === date.getMonth())
          if (!period) continue
          created.push({
            id: uid(),
            periodId: period.id,
            categoryId,
            kind,
            description: name,
            amount,
            sortOrder: 80 + index,
            templateId: null,
            paid: false,
            dueDay: day,
            termId,
            termTotal: count,
            termIndex: index + 1,
            debtId: null,
            advance: false,
          })
        }
        if (!created.length) return ''
        commit((current) => ({
          ...current,
          periods: [...current.periods, ...createdPeriods],
          entries: [...current.entries, ...carried, ...created],
        }))
        void remote(async (sb, userId) => {
          for (const period of createdPeriods) await upsertPeriod(sb, userId, period)
          for (const entry of [...carried, ...created]) await upsertEntry(sb, userId, entry)
        })
        return created[0].id
      },
      addDebt: ({ name, total, cuota, categoryId, startPeriodId, months }) => {
        const start = dbRef.current.periods.find((period) => period.id === startPeriodId)
        const count = Math.max(1, Math.min(36, Math.round(months) || planDebt(total, cuota).length || 1))
        const amounts = planSpan(total, cuota, count)
        if (!start || !name.trim() || !amounts.length) return ''
        const years = new Set<number>()
        for (let index = 0; index < amounts.length; index++) years.add(new Date(start.year, start.coveredMonth + index, 1).getFullYear())
        const createdPeriods: Period[] = []
        const carried: Entry[] = []
        for (const year of years) {
          const have = new Set(dbRef.current.periods.filter((period) => period.year === year).map((period) => period.coveredMonth))
          for (const period of createdPeriods) if (period.year === year) have.add(period.coveredMonth)
          for (let month = 0; month < 12; month++) {
            if (have.has(month)) continue
            const period: Period = {
              id: uid(),
              label: periodLabel(year, month),
              year,
              coveredMonth: month,
              sortOrder: sortOrderFor(year, month),
            }
            createdPeriods.push(period)
            carried.push(...instantiateTemplates(period.id, dbRef.current.templates, { year: period.year, month: period.coveredMonth }))
          }
        }
        const periods = [...dbRef.current.periods, ...createdPeriods]
        const debt: Debt = {
          id: uid(),
          name: name.trim(),
          total: Math.round(total),
          cuota: Math.round(cuota),
          categoryId,
          startYear: start.year,
          startMonth: start.coveredMonth,
          months: amounts.length,
        }
        const created: Entry[] = []
        amounts.forEach((amount, index) => {
          const date = new Date(start.year, start.coveredMonth + index, 1)
          const period = periods.find((item) => item.year === date.getFullYear() && item.coveredMonth === date.getMonth())
          if (!period) return
          created.push({
            id: uid(),
            periodId: period.id,
            categoryId,
            kind: 'gasto',
            description: debt.name,
            amount,
            sortOrder: 70 + index,
            templateId: null,
            paid: false,
            dueDay: null,
            termId: debt.id,
            termTotal: amounts.length,
            termIndex: index + 1,
            debtId: debt.id,
            advance: false,
          })
        })
        if (!created.length) return ''
        commit((current) => ({
          ...current,
          periods: [...current.periods, ...createdPeriods],
          debts: [...(current.debts ?? []), debt],
          entries: [...current.entries, ...carried, ...created],
        }))
        void remote(async (sb, userId) => {
          for (const period of createdPeriods) await upsertPeriod(sb, userId, period)
          for (const entry of [...carried, ...created]) await upsertEntry(sb, userId, entry)
        })
        return debt.id
      },
      updateDebt: (id, { name, total, cuota, categoryId, startPeriodId, months }) => {
        const debt = (dbRef.current.debts ?? []).find((item) => item.id === id)
        const start = dbRef.current.periods.find((period) => period.id === startPeriodId)
        const trimmed = name.trim()
        const nextTotal = Math.round(total)
        const nextCuota = Math.round(cuota)
        if (!debt || !start || !trimmed || nextTotal <= 0 || nextCuota <= 0) return
        const cuotas = dbRef.current.entries
          .filter((entry) => entry.debtId === id && !entry.advance)
          .sort((a, b) => (a.termIndex ?? 0) - (b.termIndex ?? 0))
        const paidCuotas = cuotas.filter((entry) => entry.paid)
        const startYear = start.year
        const startMonth = start.coveredMonth
        const currentMonths = debtSpan(debt, dbRef.current.periods, dbRef.current.entries)
        const requestedMonths = Math.max(1, Math.min(36, Math.round(months) || currentMonths))
        const planChanged =
          debt.total !== nextTotal ||
          debt.cuota !== nextCuota ||
          startYear !== debt.startYear ||
          startMonth !== debt.startMonth ||
          requestedMonths !== currentMonths
        const describe = (entry: Entry) => ({
          ...entry,
          description: entry.advance && entry.description !== debt.name ? entry.description : trimmed,
          categoryId,
        })
        if (!planChanged) {
          commit((current) => ({
            ...current,
            debts: (current.debts ?? []).map((item) =>
              item.id === id ? { ...item, name: trimmed, total: nextTotal, cuota: nextCuota, categoryId, months: requestedMonths } : item,
            ),
            entries: current.entries.map((entry) => (entry.debtId === id ? describe(entry) : entry)),
          }))
          return
        }
        const window = Array.from({ length: requestedMonths }, (_, index) => {
          const date = new Date(startYear, startMonth + index, 1)
          return { year: date.getFullYear(), month: date.getMonth() }
        })
        const paidKeys = new Set(
          paidCuotas.map((entry) => {
            const period = dbRef.current.periods.find((item) => item.id === entry.periodId)
            return period ? `${period.year}-${period.coveredMonth}` : ''
          }),
        )
        const openSlots = window.filter((slot) => !paidKeys.has(`${slot.year}-${slot.month}`))
        const advances = dbRef.current.entries.filter((entry) => entry.debtId === id && entry.advance).reduce((sum, entry) => sum + entry.amount, 0)
        const paidSum = paidCuotas.reduce((sum, entry) => sum + entry.amount, 0) + advances
        const amounts = planSpan(Math.max(0, nextTotal - paidSum), nextCuota, openSlots.length || 1).slice(0, openSlots.length)
        const years = new Set(window.map((slot) => slot.year))
        const createdPeriods: Period[] = []
        const carried: Entry[] = []
        for (const year of years) {
          const have = new Set(dbRef.current.periods.filter((period) => period.year === year).map((period) => period.coveredMonth))
          for (const period of createdPeriods) if (period.year === year) have.add(period.coveredMonth)
          for (let month = 0; month < 12; month++) {
            if (have.has(month)) continue
            const period: Period = {
              id: uid(),
              label: periodLabel(year, month),
              year,
              coveredMonth: month,
              sortOrder: sortOrderFor(year, month),
            }
            createdPeriods.push(period)
            carried.push(...instantiateTemplates(period.id, dbRef.current.templates, { year: period.year, month: period.coveredMonth }))
          }
        }
        const periods = [...dbRef.current.periods, ...createdPeriods]
        const created: Entry[] = []
        amounts.forEach((amount, index) => {
          const slot = openSlots[index]
          if (!slot || amount <= 0) return
          const period = periods.find((item) => item.year === slot.year && item.coveredMonth === slot.month)
          if (!period) return
          created.push({
            id: uid(),
            periodId: period.id,
            categoryId,
            kind: 'gasto',
            description: trimmed,
            amount,
            sortOrder: 70 + index,
            templateId: null,
            paid: false,
            dueDay: null,
            termId: id,
            termTotal: paidCuotas.length + amounts.length,
            termIndex: index + 1,
            debtId: id,
            advance: false,
          })
        })
        const drop = cuotas.filter((entry) => !entry.paid).map((entry) => entry.id)
        if (drop.length) noteDeleted('entries', drop)
        const numbered = [...paidCuotas.map((entry) => describe(entry)), ...created]
          .sort((a, b) => monthKey(periods, a.periodId) - monthKey(periods, b.periodId))
          .map((entry, index, list) => ({
            ...entry,
            termId: id,
            termIndex: index + 1,
            termTotal: list.length,
          }))
        commit((current) => {
          const dropIds = new Set(drop)
          const paidIds = new Set(paidCuotas.map((entry) => entry.id))
          return {
            ...current,
            periods: [...current.periods, ...createdPeriods],
            debts: (current.debts ?? []).map((item) =>
              item.id === id ? { ...item, name: trimmed, total: nextTotal, cuota: nextCuota, categoryId, startYear, startMonth, months: requestedMonths } : item,
            ),
            entries: [
              ...current.entries
                .filter((entry) => !dropIds.has(entry.id) && !paidIds.has(entry.id))
                .map((entry) => (entry.debtId === id ? describe(entry) : entry)),
              ...numbered,
              ...carried,
            ],
          }
        })
        void remote(async (sb, userId) => {
          for (const period of createdPeriods) await upsertPeriod(sb, userId, period)
          for (const entry of [...carried, ...numbered]) await upsertEntry(sb, userId, entry)
          for (const entryId of drop) await remoteDeleteEntry(sb, entryId)
        })
      },
      removeDebt: (id) => {
        const ids = dbRef.current.entries.filter((entry) => entry.debtId === id).map((entry) => entry.id)
        noteDeleted('entries', ids)
        noteDeleted('debts', [id])
        commit((current) => ({
          ...current,
          debts: (current.debts ?? []).filter((debt) => debt.id !== id),
          entries: current.entries.filter((entry) => entry.debtId !== id),
        }))
        void remote(async (sb) => {
          for (const entryId of ids) await remoteDeleteEntry(sb, entryId)
        })
      },
      addTemplate: ({ kind, description, amount, categoryId = null, startYear = null, startMonth = null, months = null }) => {
        const template: Template = {
          id: uid(),
          kind,
          description: description.trim(),
          amount,
          categoryId,
          sortOrder: dbRef.current.templates.filter((item) => item.kind === kind).length,
          startYear,
          startMonth,
          months,
        }
        const createdPeriods: Period[] = []
        let periods = dbRef.current.periods
        if (startYear != null && startMonth != null && months != null && months > 0) {
          const years = new Set<number>()
          for (let index = 0; index < months; index += 1) years.add(new Date(startYear, startMonth + index, 1).getFullYear())
          for (const year of years) {
            const have = new Set(periods.filter((period) => period.year === year).map((period) => period.coveredMonth))
            for (let month = 0; month < 12; month += 1) {
              if (have.has(month)) continue
              const period: Period = {
                id: uid(),
                label: periodLabel(year, month),
                year,
                coveredMonth: month,
                sortOrder: sortOrderFor(year, month),
              }
              createdPeriods.push(period)
              have.add(month)
            }
          }
          periods = [...periods, ...createdPeriods]
        }
        const created = periods
          .filter((period) => templateCovers(template, period.year, period.coveredMonth))
          .map((period) => instantiateTemplates(period.id, [template], { year: period.year, month: period.coveredMonth })[0])
          .filter((entry): entry is Entry => Boolean(entry))
        commit((current) => ({
          ...current,
          periods: [...current.periods, ...createdPeriods],
          templates: [...current.templates, template],
          entries: [...current.entries, ...created],
        }))
        void remote(async (sb, userId) => {
          await upsertTemplate(sb, userId, template)
          for (const period of createdPeriods) await upsertPeriod(sb, userId, period)
          for (const entry of created) await upsertEntry(sb, userId, entry)
        })
        return { template, entries: created }
      },
      updateTemplate: (id, patch) => {
        let updated: Template | undefined
        const linked: Entry[] = []
        const removed: string[] = []
        const created: Entry[] = []
        const createdPeriods: Period[] = []
        commit((current) => {
          const templates = current.templates.map((item) => {
            if (item.id !== id) return item
            updated = {
              ...item,
              ...patch,
              description: patch.description !== undefined ? patch.description : item.description,
            }
            return updated
          })
          if (!updated) return current
          const template = updated
          let periods = current.periods
          if (template.startYear != null && template.startMonth != null && template.months != null && template.months > 0) {
            const years = new Set<number>()
            for (let index = 0; index < template.months; index += 1) years.add(new Date(template.startYear, template.startMonth + index, 1).getFullYear())
            for (const year of years) {
              const have = new Set(periods.filter((period) => period.year === year).map((period) => period.coveredMonth))
              for (let month = 0; month < 12; month += 1) {
                if (have.has(month)) continue
                const period: Period = {
                  id: uid(),
                  label: periodLabel(year, month),
                  year,
                  coveredMonth: month,
                  sortOrder: sortOrderFor(year, month),
                }
                createdPeriods.push(period)
                have.add(month)
              }
            }
            periods = [...periods, ...createdPeriods]
          }
          const entries = current.entries.flatMap((entry) => {
            if (entry.templateId !== id) return [entry]
            const period = periods.find((item) => item.id === entry.periodId)
            const inside = period ? templateCovers(template, period.year, period.coveredMonth) : true
            if (!inside && !entry.paid) {
              removed.push(entry.id)
              return []
            }
            const next = {
              ...entry,
              description: template.description,
              categoryId: template.categoryId,
              kind: template.kind,
            }
            linked.push(next)
            return [next]
          })
          const have = new Set(entries.filter((entry) => entry.templateId === id).map((entry) => entry.periodId))
          for (const period of periods) {
            if (!templateCovers(template, period.year, period.coveredMonth) || have.has(period.id)) continue
            const entry = instantiateTemplates(period.id, [template], { year: period.year, month: period.coveredMonth })[0]
            if (!entry) continue
            created.push(entry)
            linked.push(entry)
            entries.push(entry)
          }
          return { ...current, periods, templates, entries }
        })
        if (!updated) return
        if (removed.length) noteDeleted('entries', removed)
        const template = updated
        window.clearTimeout(timers.current[id])
        timers.current[id] = window.setTimeout(() => {
          void remote(async (sb, userId) => {
            await upsertTemplate(sb, userId, template)
            for (const period of createdPeriods) await upsertPeriod(sb, userId, period)
            for (const entry of linked) await upsertEntry(sb, userId, entry)
            for (const entryId of removed) await remoteDeleteEntry(sb, entryId)
          })
        }, 300)
      },
      applyTemplateAmount: (id) => {
        const template = dbRef.current.templates.find((item) => item.id === id)
        if (!template) return
        const touched: Entry[] = []
        commit((current) => ({
          ...current,
          entries: current.entries.map((entry) => {
            if (entry.templateId !== id) return entry
            const next = { ...entry, amount: template.amount }
            touched.push(next)
            return next
          }),
        }))
        void remote(async (sb, userId) => {
          for (const entry of touched) await upsertEntry(sb, userId, entry)
        })
      },
      removeTemplate: (id) => {
        noteDeleted('templates', [id])
        noteDeleted(
          'entries',
          dbRef.current.entries.filter((entry) => entry.templateId === id).map((entry) => entry.id),
        )
        commit((current) => ({
          ...current,
          templates: current.templates.filter((item) => item.id !== id),
          entries: current.entries.filter((entry) => entry.templateId !== id),
        }))
        void remote((sb) => remoteDeleteTemplate(sb, id))
      },
      importDB: (next) => {
        const normalized = normalize(next)
        commit(() => normalized)
        void remote((sb, userId) => replaceDB(sb, userId, normalized))
      },
      resetSeed: () => {
        const next = buildSeed()
        commit(() => next)
        void remote((sb, userId) => replaceDB(sb, userId, next))
      },
      connect: async (config) => {
        const sb = makeClient(config)
        const { error: ping } = await sb.auth.getSession()
        if (ping) throw new Error(authMessage(ping.message))
        writeConfig(config)
        clientRef.current = sb
        setMode('supabase')
        const { data } = await sb.auth.getSession()
        if (!data.session) {
          setNeedsAuth(true)
          return
        }
        await adopt(sb, data.session)
      },
      disconnect: async () => {
        await clientRef.current?.auth.signOut()
        writeConfig(null)
        clientRef.current = null
        userRef.current = null
        setEmail(null)
        setNeedsAuth(false)
        setMode('local')
      },
      signIn: async (emailAddress, password) => {
        const sb = clientRef.current
        if (!sb) throw new Error('Primero conecta Supabase.')
        const { data, error: signError } = await sb.auth.signInWithPassword({ email: emailAddress.trim(), password })
        if (signError) throw new Error(authMessage(signError.message))
        if (!data.session) throw new Error('No se pudo abrir la sesión.')
        await adopt(sb, data.session)
      },
      signUp: async (emailAddress, password) => {
        const sb = clientRef.current
        if (!sb) throw new Error('Primero conecta Supabase.')
        const { data, error: signError } = await sb.auth.signUp({ email: emailAddress.trim(), password })
        if (signError) throw new Error(authMessage(signError.message))
        if (data.session) {
          await adopt(sb, data.session)
          return null
        }
        return 'Cuenta creada. Si Supabase pide confirmar el correo, ábrelo y luego entra. Para evitar ese paso, desactiva “Confirm email”.'
      },
      signOut: async () => {
        await clientRef.current?.auth.signOut()
        userRef.current = null
        setEmail(null)
        setNeedsAuth(true)
      },
    }
    // The functions close over the latest flags via state in the dependency list.
  }, [ready, db, mode, email, needsAuth, error])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

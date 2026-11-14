import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
import type { Category, DB, Entry, Kind, Period, Template } from './types'
import { instantiateTemplates, isDB, periodLabel, sortOrderFor, uid } from './types'
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

function normalize(db: DB): DB {
  return {
    ...db,
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
    })),
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

function saveLocal(db: DB) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

async function pullCloud(): Promise<'down' | 'empty' | DB> {
  try {
    const res = await fetch('/api/ledger', { headers: { accept: 'application/json' } })
    if (!res.ok) return 'down'
    const body = (await res.json()) as unknown
    if (body == null) return 'empty'
    return isDB(body) ? normalize(body) : 'empty'
  } catch {
    return 'down'
  }
}

async function pushCloud(next: DB) {
  let res: Response
  try {
    res = await fetch('/api/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
      keepalive: true,
    })
  } catch {
    throw new Error('No se pudo guardar en Neon.')
  }
  if (!res.ok) {
    const message = res.status === 400 ? 'El libro no se guardó: llegó incompleto.' : 'No se pudo guardar en Neon.'
    void fetch('/api/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level: 'error', action: 'guardar', message }),
      keepalive: true,
    }).catch(() => undefined)
    throw new Error(message)
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
  addEntry: (input: { periodId: string; kind: Kind; description?: string; categoryId?: string | null; amount?: number }) => Entry
  updateEntry: (id: string, patch: Partial<Pick<Entry, 'description' | 'amount' | 'categoryId' | 'paid' | 'dueDay'>>) => void
  addTerm: (input: { periodId: string; kind: Kind; description: string; categoryId?: string | null; amount: number; startDate: string; months: number }) => string
  removeEntry: (id: string) => void
  addTemplate: (input: { kind: Kind; description: string; amount: number; categoryId?: string | null }) => { template: Template; entries: Entry[] }
  updateTemplate: (id: string, patch: Partial<Pick<Template, 'description' | 'amount' | 'categoryId' | 'kind'>>) => void
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
  const [db, setDb] = useState<DB>({ categories: [], periods: [], entries: [], templates: [] })
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<'local' | 'supabase' | 'neon'>('local')
  const [email, setEmail] = useState<string | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dbRef = useRef(db)
  const cloud = useRef(false)
  const clientRef = useRef<SupabaseClient | null>(null)
  const userRef = useRef<string | null>(null)
  const timers = useRef<Record<string, number>>({})

  dbRef.current = db

  function report(err: unknown) {
    const message = err instanceof Error ? err.message : 'No se pudo guardar en la base de datos.'
    const text = message.toLowerCase()
    if (text.includes('fetch') || text.includes('network') || text.includes('neon')) {
      setError('No se pudo guardar en Neon. El cambio quedó en este teléfono.')
      return
    }
    setError(`${authMessage(message)} El cambio quedó en este navegador.`)
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

  function commit(recipe: (current: DB) => DB) {
    const next = recipe(dbRef.current)
    dbRef.current = next
    setDb(next)
    saveLocal(next)
    if (cloud.current) {
      window.clearTimeout(timers.current.cloud)
      timers.current.cloud = window.setTimeout(() => {
        void pushCloud(dbRef.current).catch(report)
      }, 300)
    }
    return next
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
      saveLocal(local)
    } else {
      dbRef.current = remoteDb
      setDb(remoteDb)
      saveLocal(remoteDb)
    }
  }

  useEffect(() => {
    const flush = () => {
      if (!cloud.current) return
      window.clearTimeout(timers.current.cloud)
      void pushCloud(dbRef.current).catch(() => undefined)
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const config = readConfig()
        const local = loadLocal()
        if (!config) {
          const remote = await pullCloud()
          if (cancel) return
          if (remote === 'down') {
            const initial = local ?? buildSeed()
            if (!local) saveLocal(initial)
            dbRef.current = initial
            setDb(initial)
            setMode('local')
            setReady(true)
            return
          }
          let initial: DB
          try {
            if (remote !== 'empty') {
              initial = remote
              saveLocal(remote)
            } else if (local) {
              initial = local
              await pushCloud(local)
            } else {
              initial = buildSeed()
              saveLocal(initial)
              await pushCloud(initial)
            }
            cloud.current = true
            dbRef.current = initial
            setDb(initial)
            setMode('neon')
            setReady(true)
          } catch (err) {
            const initial = local ?? (remote !== 'empty' ? remote : buildSeed())
            if (!local && remote === 'empty') saveLocal(initial)
            dbRef.current = initial
            setDb(initial)
            setMode(remote !== 'empty' ? 'neon' : 'local')
            cloud.current = remote !== 'empty'
            setReady(true)
            if (remote === 'empty') setError(err instanceof Error ? err.message : 'No se pudo abrir Neon.')
          }
          return
        }
        const sb = makeClient(config)
        const { data, error: sessionError } = await sb.auth.getSession()
        if (sessionError) throw sessionError
        if (!data.session) {
          if (!cancel) {
            clientRef.current = sb
            const initial = local ?? buildSeed()
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
          : instantiateTemplates(period.id, dbRef.current.templates)
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
          entries.push(...instantiateTemplates(period.id, dbRef.current.templates))
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
      addEntry: ({ periodId, kind, description = '', categoryId = null, amount = 0 }) => {
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
          paid: false,
          dueDay: null,
          termId: null,
          termTotal: null,
          termIndex: null,
        }
        commit((current) => ({ ...current, entries: [...current.entries, entry] }))
        void remote((sb, userId) => upsertEntry(sb, userId, entry))
        return entry
      },
      updateEntry: (id, patch) => {
        const currentEntry = dbRef.current.entries.find((entry) => entry.id === id)
        let updated: Entry | undefined
        commit((current) => ({
          ...current,
          entries: current.entries.map((e) => {
            if (e.id === id) {
              updated = { ...e, ...patch }
              return updated
            }
            if (patch.dueDay !== undefined && currentEntry?.termId && e.termId === currentEntry.termId) {
              return { ...e, dueDay: patch.dueDay }
            }
            return e
          }),
        }))
        if (updated) {
          const entry = updated
          window.clearTimeout(timers.current[id])
          timers.current[id] = window.setTimeout(() => {
            void remote((sb, userId) => upsertEntry(sb, userId, entry))
          }, 250)
        }
      },
      removeEntry: (id) => {
        commit((current) => ({ ...current, entries: current.entries.filter((e) => e.id !== id) }))
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
            carried.push(...instantiateTemplates(period.id, dbRef.current.templates))
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
      addTemplate: ({ kind, description, amount, categoryId = null }) => {
        const template: Template = {
          id: uid(),
          kind,
          description: description.trim(),
          amount,
          categoryId,
          sortOrder: dbRef.current.templates.filter((item) => item.kind === kind).length,
        }
        const created = dbRef.current.periods.map((period) => instantiateTemplates(period.id, [template])[0])
        commit((current) => ({
          ...current,
          templates: [...current.templates, template],
          entries: [...current.entries, ...created],
        }))
        void remote(async (sb, userId) => {
          await upsertTemplate(sb, userId, template)
          for (const entry of created) await upsertEntry(sb, userId, entry)
        })
        return { template, entries: created }
      },
      updateTemplate: (id, patch) => {
        let updated: Template | undefined
        const linked: Entry[] = []
        commit((current) => {
          const templates = current.templates.map((item) => {
            if (item.id !== id) return item
            updated = { ...item, ...patch, description: patch.description !== undefined ? patch.description : item.description }
            return updated
          })
          const entries = current.entries.map((entry) => {
            if (entry.templateId !== id || !updated) return entry
            const next = {
              ...entry,
              description: updated.description,
              categoryId: updated.categoryId,
              kind: updated.kind,
            }
            linked.push(next)
            return next
          })
          return { ...current, templates, entries }
        })
        if (!updated) return
        const template = updated
        window.clearTimeout(timers.current[id])
        timers.current[id] = window.setTimeout(() => {
          void remote(async (sb, userId) => {
            await upsertTemplate(sb, userId, template)
            for (const entry of linked) await upsertEntry(sb, userId, entry)
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

import type { DB } from './types'

const KEY = 'cuentas-sync-v1'

export interface SyncMeta {
  revision: string | null
  dirty: boolean
  provisional: boolean
  deleted: {
    categories: string[]
    periods: string[]
    entries: string[]
    templates: string[]
  }
}

const empty = (): SyncMeta => ({
  revision: null,
  dirty: false,
  provisional: false,
  deleted: { categories: [], periods: [], entries: [], templates: [] },
})

export function loadMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<SyncMeta>
    return {
      revision: typeof parsed.revision === 'string' ? parsed.revision : null,
      dirty: Boolean(parsed.dirty),
      provisional: Boolean(parsed.provisional),
      deleted: {
        categories: Array.isArray(parsed.deleted?.categories) ? parsed.deleted.categories : [],
        periods: Array.isArray(parsed.deleted?.periods) ? parsed.deleted.periods : [],
        entries: Array.isArray(parsed.deleted?.entries) ? parsed.deleted.entries : [],
        templates: Array.isArray(parsed.deleted?.templates) ? parsed.deleted.templates : [],
      },
    }
  } catch {
    return empty()
  }
}

export function saveMeta(meta: SyncMeta) {
  localStorage.setItem(KEY, JSON.stringify(meta))
}

export function markLocalChange() {
  const meta = loadMeta()
  meta.dirty = true
  meta.provisional = false
  saveMeta(meta)
}

export function noteDeleted(kind: keyof SyncMeta['deleted'], ids: string[]) {
  if (!ids.length) return
  const meta = loadMeta()
  const set = new Set(meta.deleted[kind])
  for (const id of ids) set.add(id)
  meta.deleted[kind] = [...set]
  meta.dirty = true
  meta.provisional = false
  saveMeta(meta)
}

export function hasDeletes(meta: SyncMeta) {
  return Object.values(meta.deleted).some((ids) => ids.length > 0)
}

function mergeList<T extends { id: string }>(local: T[], remote: T[], deleted: string[]): T[] {
  const drop = new Set(deleted)
  const map = new Map<string, T>()
  for (const item of remote) if (!drop.has(item.id)) map.set(item.id, item)
  for (const item of local) if (!drop.has(item.id)) map.set(item.id, item)
  return [...map.values()]
}

export function mergeBooks(local: DB, remote: DB, meta: SyncMeta): DB {
  return {
    categories: mergeList(local.categories, remote.categories, meta.deleted.categories),
    periods: mergeList(local.periods, remote.periods, meta.deleted.periods),
    templates: mergeList(local.templates, remote.templates, meta.deleted.templates),
    entries: mergeList(local.entries, remote.entries, meta.deleted.entries),
  }
}

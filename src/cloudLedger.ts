import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { neon, neonConfig } from '@neondatabase/serverless'
import { isDB, type DB } from './types'

neonConfig.disableWarningInBrowsers = true

export type CloudBook = { status: 'down' } | { status: 'empty' } | { status: 'ok'; db: DB; updatedAt: string }

function nativeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const headers: Record<string, string> = {}
  new Headers(init?.headers).forEach((value, key) => {
    headers[key] = value
  })
  if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json'
  const raw = typeof init?.body === 'string' ? init.body : ''
  return CapacitorHttp.request({
    url,
    method: init?.method ?? 'POST',
    headers,
    data: raw ? (JSON.parse(raw) as object) : undefined,
  }).then((res) => {
    const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? null)
    return new Response(body, { status: res.status })
  })
}

function stamp(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return String(value)
}

function asBook(body: unknown): CloudBook {
  if (body && typeof body === 'object' && 'data' in body) {
    const row = body as { data?: unknown; updatedAt?: unknown }
    if (row.data == null) return { status: 'empty' }
    return isDB(row.data) ? { status: 'ok', db: row.data, updatedAt: stamp(row.updatedAt) } : { status: 'down' }
  }
  if (body == null) return { status: 'empty' }
  return isDB(body) ? { status: 'ok', db: body, updatedAt: '' } : { status: 'down' }
}

async function readApi(): Promise<CloudBook> {
  const res = await fetch('/api/ledger', { headers: { accept: 'application/json' } })
  if (!res.ok) return { status: 'down' }
  return asBook(await res.json())
}

async function writeApi(db: DB): Promise<string | null> {
  const res = await fetch('/api/ledger', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(db),
    keepalive: true,
  })
  if (!res.ok) return null
  const body = (await res.json()) as { updatedAt?: unknown }
  return stamp(body.updatedAt)
}

let tablesReady: Promise<void> | null = null

async function directSql() {
  const url = import.meta.env.VITE_DATABASE_URL?.trim()
  if (!url) return null
  neonConfig.fetchFunction = nativeFetch
  const sql = neon(url)
  tablesReady ??= (async () => {
    await sql`create table if not exists ledger (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )`
    await sql`create table if not exists logs (
      id bigint generated always as identity primary key,
      at timestamptz not null default now(),
      level text not null,
      action text not null,
      message text not null,
      detail jsonb
    )`
  })().catch((err: unknown) => {
    tablesReady = null
    throw err
  })
  await tablesReady
  return sql
}

async function readDirect(): Promise<CloudBook> {
  const sql = await directSql()
  if (!sql) return { status: 'down' }
  const rows = await sql`select data, updated_at from ledger where id = 'main'`
  if (!rows.length || rows[0]?.data == null) return { status: 'empty' }
  const raw = rows[0].data
  const data = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
  if (!isDB(data)) return { status: 'down' }
  return { status: 'ok', db: data, updatedAt: stamp(rows[0].updated_at) }
}

async function writeDirect(db: DB): Promise<string | null> {
  const sql = await directSql()
  if (!sql) return null
  const payload = JSON.stringify(db)
  const rows = await sql`insert into ledger (id, data, updated_at)
    values ('main', ${payload}::jsonb, now())
    on conflict (id) do update set data = excluded.data, updated_at = now()
    returning updated_at`
  const detail = JSON.stringify({
    categories: db.categories.length,
    periods: db.periods.length,
    entries: db.entries.length,
    templates: db.templates.length,
  })
  try {
    await sql`insert into logs (level, action, message, detail)
      values ('info', 'guardar', 'libro guardado desde el teléfono', ${detail}::jsonb)`
  } catch {
    /* el libro ya quedó guardado */
  }
  return stamp(rows[0]?.updated_at)
}

export async function readCloud(): Promise<CloudBook> {
  try {
    if (Capacitor.isNativePlatform()) return await readDirect()
    return await readApi()
  } catch {
    return { status: 'down' }
  }
}

export async function writeCloud(db: DB): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) return await writeDirect(db)
    return await writeApi(db)
  } catch {
    return null
  }
}

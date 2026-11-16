import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { neon, neonConfig } from '@neondatabase/serverless'
import { authHeader, isDiego, ledgerId } from './authStore'
import { isDB, type DB } from './types'

const DIEGO_HASH = '432794f4082433f548d2f101b2bdd04bbaa82b4fbe2001d3b53881dc5832d4a3'
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIEGO_MODULES = ['cuentas', 'pendientes', 'calendario', 'ajustes']
const CUENTAS_ONLY = ['cuentas']

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
  const res = await fetch('/api/ledger', { headers: { accept: 'application/json', ...authHeader() } })
  if (!res.ok) return { status: 'down' }
  return asBook(await res.json())
}

async function writeApi(db: DB): Promise<string | null> {
  const res = await fetch('/api/ledger', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...authHeader() },
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
    await sql`create table if not exists users (
      name text primary key,
      pass_hash text not null,
      ledger_id text not null unique,
      created_at timestamptz not null default now(),
      modules jsonb not null default '["cuentas"]'::jsonb
    )`
    await sql`alter table users add column if not exists modules jsonb not null default '["cuentas"]'::jsonb`
    await sql`insert into users (name, pass_hash, ledger_id, modules)
      values ('diego', ${DIEGO_HASH}, 'main', ${JSON.stringify(DIEGO_MODULES)}::jsonb)
      on conflict (name) do update set ledger_id = 'main', modules = excluded.modules`
    await sql`create table if not exists sessions (
      token text primary key,
      user_name text not null,
      ledger_id text not null,
      created_at timestamptz not null default now()
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
  const id = ownLedger()
  if (!id) return { status: 'down' }
  const rows = await sql`select data, updated_at from ledger where id = ${id}`
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
  const id = ownLedger()
  if (!id) return null
  const rows = await sql`insert into ledger (id, data, updated_at)
    values (${id}, ${payload}::jsonb, now())
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
      values ('info', 'guardar', 'datos guardados desde el teléfono', ${detail}::jsonb)`
  } catch {
    /* los datos ya quedaron guardados */
  }
  return stamp(rows[0]?.updated_at)
}

function ownLedger() {
  const id = ledgerId()
  if (!id) return ''
  if (id === 'main') return isDiego() ? id : ''
  return id.startsWith('u-') ? id : ''
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function blankBook(): DB {
  const periods = []
  for (const year of [2026, 2027]) {
    for (let month = 0; month < 12; month += 1) {
      const prev = new Date(year, month, 0)
      periods.push({
        id: crypto.randomUUID(),
        label: `${MONTHS[prev.getMonth()]} ${prev.getDate()} - ${MONTHS[month]}`,
        year,
        coveredMonth: month,
        sortOrder: year * 100 + month,
      })
    }
  }
  return { categories: [], periods, entries: [], templates: [], debts: [] }
}

function cleanName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function moduleList(value: unknown, user: string) {
  const list = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  if (user === 'diego') return DIEGO_MODULES
  return list.length ? list : CUENTAS_ONLY
}

export async function signAccount(
  kind: 'login' | 'register',
  user: string,
  password: string,
): Promise<{ token: string; user: string; ledgerId: string; modules: string[] } | { error: string }> {
  if (!Capacitor.isNativePlatform()) {
    const res = await fetch(kind === 'login' ? '/api/auth/login' : '/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user, password }),
    })
    const body = (await res.json().catch(() => null)) as { token?: string; user?: string; ledgerId?: string; modules?: unknown; error?: string } | null
    if (!res.ok || !body?.token || !body.user || !body.ledgerId) return { error: body?.error || 'No se pudo entrar.' }
    return { token: body.token, user: body.user, ledgerId: body.ledgerId, modules: moduleList(body.modules, body.user) }
  }
  const sql = await directSql()
  if (!sql) return { error: 'No se pudo entrar.' }
  const name = cleanName(user)
  const hash = await sha256(password)
  if (kind === 'register') {
    if (name.length < 2 || password.length < 4) return { error: 'Escribe un usuario y una contraseña.' }
    if (name === 'diego') return { error: 'Ese usuario ya existe.' }
    const taken = await sql`select name from users where name = ${name}`
    if (taken.length) return { error: 'Ese usuario ya existe.' }
    const id = `u-${crypto.randomUUID()}`
    const book = JSON.stringify(blankBook())
    await sql`insert into users (name, pass_hash, ledger_id, modules) values (${name}, ${hash}, ${id}, ${JSON.stringify(CUENTAS_ONLY)}::jsonb)`
    await sql`insert into ledger (id, data, updated_at) values (${id}, ${book}::jsonb, now())`
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, '0')).join('')
    await sql`insert into sessions (token, user_name, ledger_id) values (${token}, ${name}, ${id})`
    return { token, user: name, ledgerId: id, modules: CUENTAS_ONLY }
  }
  let id = ''
  let modules = CUENTAS_ONLY
  const found = await sql`select ledger_id, pass_hash, modules from users where name = ${name}`
  if (found[0] && found[0].pass_hash === hash) {
    id = String(found[0].ledger_id)
    modules = moduleList(found[0].modules, name)
  } else if (name === 'diego' && hash === DIEGO_HASH) {
    id = 'main'
    modules = DIEGO_MODULES
  }
  if (!id || (id === 'main' && name !== 'diego')) return { error: 'Usuario o contraseña incorrectos.' }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  await sql`insert into sessions (token, user_name, ledger_id) values (${token}, ${name}, ${id})`
  return { token, user: name, ledgerId: id, modules }
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

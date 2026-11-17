import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

const DIEGO_HASH = '432794f4082433f548d2f101b2bdd04bbaa82b4fbe2001d3b53881dc5832d4a3'
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIEGO_MODULES = ['cuentas', 'pendientes', 'calendario', 'ajustes']
const CUENTAS_ONLY = ['cuentas']

type Sql = NeonQueryFunction<false, false>

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function isLedger(value: unknown): value is { categories: unknown[]; periods: unknown[]; entries: unknown[]; templates?: unknown[] } {
  if (!value || typeof value !== 'object') return false
  const row = value as { categories?: unknown; periods?: unknown; entries?: unknown }
  return Array.isArray(row.categories) && Array.isArray(row.periods) && Array.isArray(row.entries)
}

function counts(value: { categories: unknown[]; periods: unknown[]; entries: unknown[]; templates?: unknown[] }) {
  return {
    categories: value.categories.length,
    periods: value.periods.length,
    entries: value.entries.length,
    templates: Array.isArray(value.templates) ? value.templates.length : 0,
  }
}

let ready: Promise<void> | null = null

function ensure(sql: Sql) {
  ready ??= (async () => {
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
    await sql`create table if not exists boards (
      ledger_id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )`
    await sql`create table if not exists vaults (
      ledger_id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )`
  })().catch((err: unknown) => {
    ready = null
    throw err
  })
  return ready
}

async function writeLog(sql: Sql, level: string, action: string, message: string, detail: unknown) {
  try {
    await sql`insert into logs (level, action, message, detail)
      values (${level}, ${action}, ${message}, ${detail == null ? null : JSON.stringify(detail)}::jsonb)`
  } catch {
    /* un fallo del log no puede borrar el guardado */
  }
}

function hashPassword(password: string) {
  return createHash('sha256').update(password).digest('hex')
}

function cleanName(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '')
}

function emptyBook() {
  const periods = []
  for (const year of [2026, 2027]) {
    for (let month = 0; month < 12; month += 1) {
      const prev = new Date(year, month, 0)
      periods.push({
        id: randomUUID(),
        label: `${MONTHS[prev.getMonth()]} ${prev.getDate()} - ${MONTHS[month]}`,
        year,
        coveredMonth: month,
        sortOrder: year * 100 + month,
      })
    }
  }
  return { categories: [], periods, entries: [], templates: [], debts: [] }
}

function isBoard(value: unknown): value is { categories: unknown[]; columns: unknown[]; cards: unknown[] } {
  if (!value || typeof value !== 'object') return false
  const row = value as { categories?: unknown; columns?: unknown; cards?: unknown }
  return Array.isArray(row.categories) && Array.isArray(row.columns) && Array.isArray(row.cards)
}

function isVault(value: unknown): value is { extra: unknown[]; overrides: Record<string, unknown> } {
  if (!value || typeof value !== 'object') return false
  const row = value as { extra?: unknown; overrides?: unknown }
  return Array.isArray(row.extra) && !!row.overrides && typeof row.overrides === 'object'
}

async function diegoLedger(sql: Sql, req: IncomingMessage) {
  const token = bearer(req)
  const session = token ? await sql`select user_name, ledger_id from sessions where token = ${token}` : []
  if (String(session[0]?.user_name) !== 'diego') return ''
  const ledgerId = String(session[0]?.ledger_id ?? '')
  return ledgerId === 'main' ? ledgerId : ''
}

function bearer(req: IncomingMessage) {
  const header = req.headers.authorization ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(Array.isArray(header) ? header[0] : header)
  return match?.[1]?.trim() ?? ''
}

export function ledgerApi(databaseUrl: string | undefined): Plugin {
  return {
    name: 'cuentas-ledger',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0]
        if (path !== '/api/ledger' && path !== '/api/board' && path !== '/api/vault' && path !== '/api/logs' && path !== '/api/auth/login' && path !== '/api/auth/register') {
          next()
          return
        }
        await handle(databaseUrl, path, req, res)
      })
    },
  }
}

function moduleList(_value: unknown, user: string) {
  return user === 'diego' ? DIEGO_MODULES : CUENTAS_ONLY
}

async function handle(databaseUrl: string | undefined, path: string, req: IncomingMessage, res: ServerResponse) {
  if (!databaseUrl) {
    res.statusCode = 503
    res.setHeader('content-type', 'application/json')
    res.end('{"error":"sin base"}')
    return
  }
  const sql = neon(databaseUrl)
  try {
    await ensure(sql)
    if (path === '/api/auth/login' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as { user?: unknown; password?: unknown }
      const name = cleanName(body.user)
      const password = String(body.password ?? '')
      const hash = hashPassword(password)
      let ledgerId = ''
      let modules: string[] = []
      const found = await sql`select ledger_id, pass_hash, modules from users where name = ${name}`
      if (found[0] && found[0].pass_hash === hash) {
        ledgerId = String(found[0].ledger_id)
        modules = moduleList(found[0].modules, name)
        if (name !== 'diego') {
          await sql`update users set modules = ${JSON.stringify(CUENTAS_ONLY)}::jsonb where name = ${name}`
        }
      } else if (name === 'diego' && hash === DIEGO_HASH) {
        ledgerId = 'main'
        modules = DIEGO_MODULES
      }
      if (!ledgerId || (ledgerId === 'main' && name !== 'diego')) {
        res.statusCode = 401
        res.setHeader('content-type', 'application/json')
        res.end('{"error":"Usuario o contraseña incorrectos."}')
        return
      }
      const token = randomBytes(24).toString('hex')
      await sql`insert into sessions (token, user_name, ledger_id) values (${token}, ${name}, ${ledgerId})`
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ token, user: name, ledgerId, modules }))
      return
    }
    if (path === '/api/auth/register' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as { user?: unknown; password?: unknown }
      const name = cleanName(body.user)
      const password = String(body.password ?? '')
      if (name.length < 2 || password.length < 4) {
        res.statusCode = 400
        res.setHeader('content-type', 'application/json')
        res.end('{"error":"Escribe un usuario y una contraseña."}')
        return
      }
      if (name === 'diego') {
        res.statusCode = 409
        res.setHeader('content-type', 'application/json')
        res.end('{"error":"Ese usuario ya existe."}')
        return
      }
      const taken = await sql`select name from users where name = ${name}`
      if (taken.length) {
        res.statusCode = 409
        res.setHeader('content-type', 'application/json')
        res.end('{"error":"Ese usuario ya existe."}')
        return
      }
      const ledgerId = `u-${randomUUID()}`
      const book = emptyBook()
      const modules = CUENTAS_ONLY
      await sql`insert into users (name, pass_hash, ledger_id, modules) values (${name}, ${hashPassword(password)}, ${ledgerId}, ${JSON.stringify(modules)}::jsonb)`
      await sql`insert into ledger (id, data, updated_at) values (${ledgerId}, ${JSON.stringify(book)}::jsonb, now())`
      const token = randomBytes(24).toString('hex')
      await sql`insert into sessions (token, user_name, ledger_id) values (${token}, ${name}, ${ledgerId})`
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ token, user: name, ledgerId, modules }))
      return
    }
    if (path === '/api/board' && (req.method === 'GET' || req.method === 'PUT')) {
      const ledgerId = await diegoLedger(sql, req)
      if (!ledgerId) {
        res.statusCode = 401
        res.setHeader('content-type', 'application/json')
        res.end('{"error":"Entra de nuevo."}')
        return
      }
      if (req.method === 'GET') {
        const rows = await sql`select data, updated_at from boards where ledger_id = ${ledgerId}`
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ data: rows[0]?.data ?? null, updatedAt: rows[0]?.updated_at ?? null }))
        return
      }
      const parsed = JSON.parse(await readBody(req)) as unknown
      if (!isBoard(parsed)) {
        res.statusCode = 400
        res.setHeader('content-type', 'application/json')
        res.end('{"error":"datos inválidos"}')
        return
      }
      const saved = await sql`insert into boards (ledger_id, data, updated_at)
        values (${ledgerId}, ${JSON.stringify(parsed)}::jsonb, now())
        on conflict (ledger_id) do update set data = excluded.data, updated_at = now()
        returning updated_at`
      await writeLog(sql, 'info', 'guardar', 'Pendientes guardados', { cards: parsed.cards.length })
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true, updatedAt: saved[0]?.updated_at ?? null }))
      return
    }
    if (path === '/api/vault' && (req.method === 'GET' || req.method === 'PUT')) {
      const ledgerId = await diegoLedger(sql, req)
      if (!ledgerId) {
        res.statusCode = 401
        res.setHeader('content-type', 'application/json')
        res.end('{"error":"Entra de nuevo."}')
        return
      }
      if (req.method === 'GET') {
        const rows = await sql`select data, updated_at from vaults where ledger_id = ${ledgerId}`
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ data: rows[0]?.data ?? null, updatedAt: rows[0]?.updated_at ?? null }))
        return
      }
      const parsed = JSON.parse(await readBody(req)) as unknown
      if (!isVault(parsed)) {
        res.statusCode = 400
        res.setHeader('content-type', 'application/json')
        res.end('{"error":"datos inválidos"}')
        return
      }
      const saved = await sql`insert into vaults (ledger_id, data, updated_at)
        values (${ledgerId}, ${JSON.stringify(parsed)}::jsonb, now())
        on conflict (ledger_id) do update set data = excluded.data, updated_at = now()
        returning updated_at`
      await writeLog(sql, 'info', 'guardar', 'Registro guardado', { extra: parsed.extra.length })
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true, updatedAt: saved[0]?.updated_at ?? null }))
      return
    }
    if ((path === '/api/ledger') && (req.method === 'GET' || req.method === 'PUT' || req.method === 'POST')) {
      const token = bearer(req)
      const session = token ? await sql`select user_name, ledger_id from sessions where token = ${token}` : []
      const ledgerId = session[0] ? String(session[0].ledger_id) : ''
      if (!ledgerId || (ledgerId === 'main' && String(session[0]?.user_name) !== 'diego')) {
        res.statusCode = 401
        res.setHeader('content-type', 'application/json')
        res.end('{"error":"Entra de nuevo."}')
        return
      }
      if (req.method === 'GET') {
        const rows = await sql`select data, updated_at from ledger where id = ${ledgerId}`
        const data = rows[0]?.data ?? null
        const updatedAt = rows[0]?.updated_at ?? null
        if (isLedger(data)) await writeLog(sql, 'info', 'cargar', 'Datos leídos', counts(data))
        else await writeLog(sql, 'info', 'cargar', 'Base de datos vacía', null)
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ data, updatedAt }))
        return
      }
      const parsed = JSON.parse(await readBody(req)) as unknown
      if (!isLedger(parsed)) {
        await writeLog(sql, 'error', 'guardar', 'Se rechazaron datos inválidos', null)
        res.statusCode = 400
        res.setHeader('content-type', 'application/json')
        res.end('{"error":"datos inválidos"}')
        return
      }
      const detail = counts(parsed)
      const saved = await sql`insert into ledger (id, data, updated_at)
        values (${ledgerId}, ${JSON.stringify(parsed)}::jsonb, now())
        on conflict (id) do update set data = excluded.data, updated_at = now()
        returning updated_at`
      await writeLog(sql, 'info', 'guardar', 'Datos guardados', detail)
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true, updatedAt: saved[0]?.updated_at ?? null }))
      return
    }
    if (path === '/api/logs' && req.method === 'GET') {
      const rows = await sql`select id, at, level, action, message, detail from logs order by id desc limit 50`
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(rows))
      return
    }
    if (path === '/api/logs' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as { level?: string; action?: string; message?: string; detail?: unknown }
      await writeLog(sql, body.level || 'info', body.action || 'cliente', body.message || '', body.detail ?? null)
      res.setHeader('content-type', 'application/json')
      res.end('{"ok":true}')
      return
    }
    res.statusCode = 405
    res.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error'
    await writeLog(sql, 'error', 'error', message, null)
    res.statusCode = 500
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: message }))
  }
}

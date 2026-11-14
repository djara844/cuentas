import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

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
    /* un fallo del log no puede borrar el guardado del libro */
  }
}

export function ledgerApi(databaseUrl: string | undefined): Plugin {
  return {
    name: 'cuentas-ledger',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0]
        if (path !== '/api/ledger' && path !== '/api/logs') {
          next()
          return
        }
        await handle(databaseUrl, path, req, res)
      })
    },
  }
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
    if (path === '/api/ledger' && req.method === 'GET') {
      const rows = await sql`select data, updated_at from ledger where id = 'main'`
      const data = rows[0]?.data ?? null
      if (isLedger(data)) await writeLog(sql, 'info', 'cargar', 'Libro leído', counts(data))
      else await writeLog(sql, 'info', 'cargar', 'Libro vacío', null)
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(data))
      return
    }
    if (path === '/api/ledger' && (req.method === 'PUT' || req.method === 'POST')) {
      const parsed = JSON.parse(await readBody(req)) as unknown
      if (!isLedger(parsed)) {
        await writeLog(sql, 'error', 'guardar', 'Se rechazó un libro inválido', null)
        res.statusCode = 400
        res.setHeader('content-type', 'application/json')
        res.end('{"error":"libro inválido"}')
        return
      }
      const detail = counts(parsed)
      await sql`insert into ledger (id, data, updated_at)
        values ('main', ${JSON.stringify(parsed)}::jsonb, now())
        on conflict (id) do update set data = excluded.data, updated_at = now()`
      await writeLog(sql, 'info', 'guardar', 'Libro guardado', detail)
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

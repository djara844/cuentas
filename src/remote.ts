import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Category, DB, Entry, Period, Template } from './types'

const CONFIG_KEY = 'cuentas-supabase'

export interface SupabaseConfig {
  url: string
  key: string
}

export function readConfig(): SupabaseConfig | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (envUrl && envKey) return { url: envUrl, key: envKey }
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SupabaseConfig
    if (parsed.url && parsed.key) return { url: parsed.url.trim(), key: parsed.key.trim() }
  } catch {
    return null
  }
  return null
}

export function writeConfig(config: SupabaseConfig | null) {
  if (!config) localStorage.removeItem(CONFIG_KEY)
  else localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function makeClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
}

function catToRow(c: Category, userId: string) {
  return { id: c.id, user_id: userId, name: c.name, kind: c.kind, color: c.color, sort_order: c.sortOrder }
}

function periodToRow(p: Period, userId: string) {
  return {
    id: p.id,
    user_id: userId,
    label: p.label,
    year: p.year,
    covered_month: p.coveredMonth,
    sort_order: p.sortOrder,
  }
}

function entryToRow(e: Entry, userId: string) {
  return {
    id: e.id,
    user_id: userId,
    period_id: e.periodId,
    category_id: e.categoryId,
    template_id: e.templateId,
    kind: e.kind,
    description: e.description,
    amount: Math.round(e.amount),
    sort_order: e.sortOrder,
    paid: Boolean(e.paid),
    due_day: e.dueDay,
    term_id: e.termId,
    term_total: e.termTotal,
    term_index: e.termIndex,
  }
}

function templateToRow(t: Template, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    kind: t.kind,
    category_id: t.categoryId,
    description: t.description,
    amount: Math.round(t.amount),
    sort_order: t.sortOrder,
  }
}

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function fetchDB(sb: SupabaseClient, userId: string): Promise<DB> {
  const [categories, periods, entries, templates] = await Promise.all([
    sb.from('categories').select('*').eq('user_id', userId),
    sb.from('periods').select('*').eq('user_id', userId),
    sb.from('entries').select('*').eq('user_id', userId),
    sb.from('templates').select('*').eq('user_id', userId),
  ])
  throwIf(categories.error)
  throwIf(periods.error)
  throwIf(entries.error)
  const templateRows = templates.error && /does not exist|schema cache/i.test(templates.error.message) ? [] : templates.data
  if (templates.error && templateRows !== templates.data) {
    /* la tabla todavía no existe: el libro sigue en local hasta correr el SQL nuevo */
  } else {
    throwIf(templates.error)
  }

  return {
    categories: (categories.data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      kind: row.kind as Category['kind'],
      color: row.color as string,
      sortOrder: Number(row.sort_order),
    })),
    periods: (periods.data ?? []).map((row) => ({
      id: row.id as string,
      label: row.label as string,
      year: Number(row.year),
      coveredMonth: Number(row.covered_month),
      sortOrder: Number(row.sort_order),
    })),
    templates: (templateRows ?? []).map((row) => ({
      id: row.id as string,
      kind: row.kind as Template['kind'],
      categoryId: (row.category_id as string | null) ?? null,
      description: (row.description as string) ?? '',
      amount: Number(row.amount),
      sortOrder: Number(row.sort_order),
    })),
    entries: (entries.data ?? []).map((row) => ({
      id: row.id as string,
      periodId: row.period_id as string,
      categoryId: (row.category_id as string | null) ?? null,
      templateId: (row.template_id as string | null) ?? null,
      kind: row.kind as Entry['kind'],
      description: (row.description as string) ?? '',
      amount: Number(row.amount),
      sortOrder: Number(row.sort_order),
      paid: Boolean(row.paid),
      dueDay: row.due_day == null ? null : Number(row.due_day),
      termId: (row.term_id as string | null) ?? null,
      termTotal: row.term_total == null ? null : Number(row.term_total),
      termIndex: row.term_index == null ? null : Number(row.term_index),
    })),
  }
}

export async function replaceDB(sb: SupabaseClient, userId: string, db: DB) {
  throwIf((await sb.from('entries').delete().eq('user_id', userId)).error)
  throwIf((await sb.from('periods').delete().eq('user_id', userId)).error)
  const templatesDelete = await sb.from('templates').delete().eq('user_id', userId)
  if (templatesDelete.error && !/does not exist|schema cache/i.test(templatesDelete.error.message)) throwIf(templatesDelete.error)
  throwIf((await sb.from('categories').delete().eq('user_id', userId)).error)
  if (db.categories.length) throwIf((await sb.from('categories').insert(db.categories.map((c) => catToRow(c, userId)))).error)
  if (db.templates.length) throwIf((await sb.from('templates').insert(db.templates.map((t) => templateToRow(t, userId)))).error)
  if (db.periods.length) throwIf((await sb.from('periods').insert(db.periods.map((p) => periodToRow(p, userId)))).error)
  if (db.entries.length) throwIf((await sb.from('entries').insert(db.entries.map((e) => entryToRow(e, userId)))).error)
}

export async function upsertCategory(sb: SupabaseClient, userId: string, category: Category) {
  throwIf((await sb.from('categories').upsert(catToRow(category, userId))).error)
}

export async function deleteCategory(sb: SupabaseClient, id: string) {
  throwIf((await sb.from('categories').delete().eq('id', id)).error)
}

export async function upsertPeriod(sb: SupabaseClient, userId: string, period: Period) {
  throwIf((await sb.from('periods').upsert(periodToRow(period, userId))).error)
}

export async function deletePeriod(sb: SupabaseClient, id: string) {
  throwIf((await sb.from('entries').delete().eq('period_id', id)).error)
  throwIf((await sb.from('periods').delete().eq('id', id)).error)
}

export async function upsertEntry(sb: SupabaseClient, userId: string, entry: Entry) {
  throwIf((await sb.from('entries').upsert(entryToRow(entry, userId))).error)
}

export async function deleteEntry(sb: SupabaseClient, id: string) {
  throwIf((await sb.from('entries').delete().eq('id', id)).error)
}

export async function upsertTemplate(sb: SupabaseClient, userId: string, template: Template) {
  throwIf((await sb.from('templates').upsert(templateToRow(template, userId))).error)
}

export async function deleteTemplate(sb: SupabaseClient, id: string) {
  throwIf((await sb.from('entries').delete().eq('template_id', id)).error)
  throwIf((await sb.from('templates').delete().eq('id', id)).error)
}

export function authMessage(message: string): string {
  const text = message.toLowerCase()
  if (text.includes('invalid login')) return 'Correo o contraseña incorrectos.'
  if (text.includes('already registered') || text.includes('already been registered')) return 'Ya existe una cuenta con ese correo. Entra con la contraseña.'
  if (text.includes('email not confirmed')) return 'Confirma el correo antes de entrar, o desactiva “Confirm email” en Supabase.'
  if (text.includes('password')) return 'La contraseña debe tener al menos 6 caracteres.'
  if (text.includes('does not exist') || text.includes('schema cache')) return 'Faltan las tablas. En Supabase abre SQL Editor, pega supabase/schema.sql y ejecútalo.'
  if (text.includes('fetch') || text.includes('network') || text.includes('failed to fetch')) return 'No hubo conexión con Supabase. Revisa la URL y la clave.'
  return message
}

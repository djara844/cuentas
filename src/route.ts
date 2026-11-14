export type View = 'inicio' | 'pendientes' | 'calendario' | 'privado' | 'periodo' | 'anio' | 'reportes' | 'recurrentes' | 'categorias' | 'ajustes'

export interface Route {
  view: View
  periodId: string | null
}

export function readRoute(): Route {
  const raw = location.hash.replace(/^#\/?/, '')
  if (!raw || raw === 'inicio') return { view: 'inicio', periodId: null }
  if (raw === 'pendientes') return { view: 'pendientes', periodId: null }
  if (raw === 'v') return { view: 'privado', periodId: null }
  if (raw === 'calendario') return { view: 'calendario', periodId: null }
  if (raw === 'cuentas') return { view: 'periodo', periodId: null }
  if (raw.startsWith('p/')) return { view: 'periodo', periodId: decodeURIComponent(raw.slice(2)) }
  if (raw === 'anio' || raw === 'reportes' || raw === 'recurrentes' || raw === 'categorias' || raw === 'ajustes' || raw === 'calendario') return { view: raw, periodId: null }
  return { view: 'inicio', periodId: null }
}

export function goPeriod(id: string) {
  location.hash = `#/p/${encodeURIComponent(id)}`
}

export function go(view: Exclude<View, 'periodo'>) {
  location.hash = `#/${view}`
}

export function openCuentas() {
  location.hash = '#/cuentas'
}

export function openPrivate() {
  location.hash = '#/v'
}

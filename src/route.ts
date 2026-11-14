export type View = 'inicio' | 'pendientes' | 'calendario' | 'privado' | 'periodo' | 'anio' | 'reportes' | 'recurrentes' | 'categorias' | 'ajustes'
export type SettingsScope = 'general' | 'cuentas' | 'pendientes'

export interface Route {
  view: View
  periodId: string | null
  settings: SettingsScope | null
}

export function readRoute(): Route {
  const raw = location.hash.replace(/^#\/?/, '')
  const base = { periodId: null, settings: null }
  if (!raw || raw === 'inicio') return { view: 'inicio', ...base }
  if (raw === 'pendientes') return { view: 'pendientes', ...base }
  if (raw === 'v') return { view: 'privado', ...base }
  if (raw === 'calendario') return { view: 'calendario', ...base }
  if (raw === 'cuentas') return { view: 'periodo', ...base }
  if (raw.startsWith('p/')) return { view: 'periodo', periodId: decodeURIComponent(raw.slice(2)), settings: null }
  if (raw === 'ajustes' || raw.startsWith('ajustes/')) {
    const scope = raw.split('/')[1]
    const settings: SettingsScope = scope === 'cuentas' || scope === 'pendientes' ? scope : 'general'
    return { view: 'ajustes', periodId: null, settings }
  }
  if (raw === 'anio' || raw === 'reportes' || raw === 'recurrentes' || raw === 'categorias') return { view: raw, ...base }
  return { view: 'inicio', ...base }
}

export function goSettings(scope: SettingsScope) {
  location.hash = scope === 'general' ? '#/ajustes' : `#/ajustes/${scope}`
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

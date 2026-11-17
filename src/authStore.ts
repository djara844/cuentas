const KEY = 'cuentas-session-v1'

export interface Account {
  user: string
  token: string
  ledgerId: string
  modules: string[]
}

const DIEGO_MODULES = ['cuentas', 'pendientes', 'calendario', 'ajustes']

function modulesOf(user: string, _value: unknown) {
  return user === 'diego' ? DIEGO_MODULES : ['cuentas']
}

function read(): Account | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw || raw === 'diego') return null
    const parsed = JSON.parse(raw) as Account
    if (!parsed?.token || !parsed.user || !parsed.ledgerId) return null
    if (parsed.user !== 'diego' && !parsed.ledgerId.startsWith('u-')) return null
    if (parsed.user === 'diego' && parsed.ledgerId !== 'main') return null
    parsed.modules = modulesOf(parsed.user, parsed.modules)
    return parsed
  } catch {
    return null
  }
}

export function account(): Account | null {
  return read()
}

export function currentUser(): string {
  return read()?.user ?? ''
}

export function isDiego(): boolean {
  return currentUser() === 'diego'
}

export function can(module: string): boolean {
  return read()?.modules.includes(module) ?? false
}

export function authHeader(): Record<string, string> {
  const token = read()?.token
  return token ? { authorization: `Bearer ${token}` } : {}
}

export function ledgerId(): string {
  return read()?.ledgerId ?? ''
}

export function saveAccount(next: Account) {
  localStorage.setItem(KEY, JSON.stringify(next))
  localStorage.removeItem('cuentas-db-v2')
  localStorage.removeItem('cuentas-sync-v1')
}

export function clearAccount() {
  localStorage.removeItem(KEY)
  localStorage.removeItem('cuentas-db-v2')
  localStorage.removeItem('cuentas-sync-v1')
}

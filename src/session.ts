const SESSION_KEY = 'cuentas-session-v1'
const USER = 'diego'
const PASS_HASH = '432794f4082433f548d2f101b2bdd04bbaa82b4fbe2001d3b53881dc5832d4a3'

export function isLoggedIn(): boolean {
  return localStorage.getItem(SESSION_KEY) === USER
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function login(user: string, password: string): Promise<boolean> {
  const name = user.trim().toLowerCase()
  const hash = await sha256(password)
  if (name !== USER || hash !== PASS_HASH) return false
  localStorage.setItem(SESSION_KEY, USER)
  return true
}

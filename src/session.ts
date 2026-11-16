import { clearAccount, currentUser, isDiego, can, saveAccount, account } from './authStore'
import { signAccount } from './cloudLedger'

export { currentUser, isDiego, can }

export function isLoggedIn(): boolean {
  return account() != null
}

export function logout() {
  clearAccount()
}

export async function login(user: string, password: string): Promise<boolean> {
  const result = await signAccount('login', user, password)
  if ('error' in result) return false
  saveAccount(result)
  return true
}

export async function register(user: string, password: string): Promise<string | null> {
  const result = await signAccount('register', user, password)
  if ('error' in result) return result.error
  saveAccount(result)
  return null
}

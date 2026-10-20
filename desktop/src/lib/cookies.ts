/**
 * Small persisted key/value helpers (name kept from shadcn-admin).
 * Electron loads the panel from file://, where document.cookie does not persist,
 * so values live in localStorage instead.
 */

export function getCookie(name: string): string | undefined {
  try {
    return localStorage.getItem(name) ?? undefined
  } catch {
    return undefined
  }
}

export function setCookie(name: string, value: string, _maxAge?: number): void {
  try {
    localStorage.setItem(name, value)
  } catch {
    // storage unavailable — keep in-memory default
  }
}

export function removeCookie(name: string): void {
  try {
    localStorage.removeItem(name)
  } catch {
    // ignore
  }
}

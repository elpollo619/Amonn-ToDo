// Cliente HTTP hacia el backend auto-alojado (el servidor del NAS).
// El token de sesión se guarda en el navegador y se envía en cada petición.

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const TOKEN_KEY = 'amonn.token'

/** Modo demo: sin backend, datos locales de ejemplo (para probar la app). */
export const isDemo = import.meta.env.VITE_DEMO === 'true'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* almacenamiento no disponible */
  }
}

interface ApiError extends Error {
  status?: number
}

/** Realiza una petición al backend, añadiendo el token y parseando JSON. */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    const err: ApiError = new Error(data?.error ?? `Error ${res.status}`)
    err.status = res.status
    throw err
  }
  return data as T
}

/** URL del canal de eventos en tiempo real (SSE), con el token en la query. */
export function eventsUrl(): string {
  const token = getToken() ?? ''
  return `${API_BASE}/api/events?token=${encodeURIComponent(token)}`
}

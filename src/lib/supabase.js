import { createClient } from '@supabase/supabase-js'

let rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').toString().trim().replace(/^['"]|['"]$/g, '')
let rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').toString().trim().replace(/^['"]|['"]$/g, '')

// Limpieza adicional en caso de que se haya pegado con "VITE_SUPABASE_URL=" por accidente en Vercel/Netlify
if (rawUrl.startsWith('VITE_SUPABASE_URL=')) {
  rawUrl = rawUrl.replace('VITE_SUPABASE_URL=', '').trim().replace(/^['"]|['"]$/g, '')
}
if (rawKey.startsWith('VITE_SUPABASE_ANON_KEY=')) {
  rawKey = rawKey.replace('VITE_SUPABASE_ANON_KEY=', '').trim().replace(/^['"]|['"]$/g, '')
}

if (rawUrl === 'undefined' || rawUrl === 'null') rawUrl = ''
if (rawKey === 'undefined' || rawKey === 'null') rawKey = ''

// Si pegaron la URL sin https://, lo agregamos automáticamente
if (rawUrl && !rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
  rawUrl = 'https://' + rawUrl
}

const finalUrl = rawUrl || 'https://placeholder.supabase.co'
const finalKey = rawKey || 'placeholder'

if (!rawUrl || !rawKey || rawUrl.includes('tu-proyecto') || rawKey.includes('tu-anon-key')) {
  console.warn(
    'Supabase credentials are not configured or valid. Falling back to placeholder client.'
  )
}

// ── Auto-refresh / JWT Expired Recovery Interceptor ──────────────────────────
let activeRefreshPromise = null

export async function refreshSupabaseSession() {
  if (!activeRefreshPromise) {
    activeRefreshPromise = (async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession()
        if (error || !data?.session) {
          console.warn('[Auth] Session refresh failed:', error)
          // Si el refresh token no es válido o ha expirado, limpiar la sesión
          if (
            error?.message?.includes('refresh_token_not_found') ||
            error?.message?.includes('Invalid Refresh Token') ||
            error?.status === 400 ||
            error?.status === 401
          ) {
            await supabase.auth.signOut({ scope: 'local' })
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('gea:session_expired'))
            }
          }
          return null
        }
        return data.session
      } catch (err) {
        console.error('[Auth] Exception during refreshSession:', err)
        return null
      } finally {
        activeRefreshPromise = null
      }
    })()
  }
  return activeRefreshPromise
}

const customFetch = async (url, options = {}) => {
  const urlStr = typeof url === 'string' ? url : url?.url || ''

  // No interceptar peticiones de auth directa para evitar ciclos
  if (urlStr.includes('/auth/v1/token') || urlStr.includes('/auth/v1/logout')) {
    return fetch(url, options)
  }

  const response = await fetch(url, options)

  // Si recibimos 401 (JWT expired / unauthorized)
  if (response.status === 401) {
    let isJwtExpired = false
    try {
      const clone = response.clone()
      const text = await clone.text()
      if (
        text.includes('JWT expired') ||
        text.includes('jwt expired') ||
        text.includes('PGRST301') ||
        text.includes('token is expired') ||
        text.includes('invalid claim: exp')
      ) {
        isJwtExpired = true
      }
    } catch {
      // Ignorar errores al clonar o leer el body
    }

    if (isJwtExpired) {
      console.warn('[Auth] JWT expired detected on request. Attempting auto-refresh...')
      const refreshedSession = await refreshSupabaseSession()

      if (refreshedSession?.access_token) {
        // Reintentar la petición original con el nuevo token de acceso
        const newHeaders = new Headers(options.headers || {})
        newHeaders.set('Authorization', `Bearer ${refreshedSession.access_token}`)

        return fetch(url, {
          ...options,
          headers: newHeaders
        })
      }
    }
  }

  return response
}

export const supabase = createClient(finalUrl, finalKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  global: {
    headers: { 'x-application-name': 'gea-dashboard-v2' },
    fetch: customFetch
  }
})

// ── Listener para recuperar la sesión al volver a la pestaña o reactivar la pantalla ─
if (typeof window !== 'undefined') {
  const checkAndRefreshToken = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.expires_at) {
        // Si el token expira en menos de 2 minutos o ya expiró
        const expiresAtMs = session.expires_at * 1000
        if (Date.now() >= expiresAtMs - 120000) {
          console.log('[Auth] Token expired or expiring soon on tab focus. Refreshing...')
          await refreshSupabaseSession()
        }
      }
    } catch (e) {
      console.warn('[Auth] Tab focus session check error:', e)
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkAndRefreshToken()
    }
  })

  window.addEventListener('focus', () => {
    checkAndRefreshToken()
  })
}

export const isSupabaseConfigured = () => {
  return (
    Boolean(rawUrl && rawKey) &&
    !rawUrl.includes('tu-proyecto') &&
    !rawUrl.includes('placeholder') &&
    !rawKey.includes('PEGA_AQUI') &&
    !rawKey.includes('placeholder')
  )
}


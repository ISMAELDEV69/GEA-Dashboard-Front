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

export const supabase = createClient(finalUrl, finalKey)

export const isSupabaseConfigured = () => {
  return (
    Boolean(rawUrl && rawKey) &&
    !rawUrl.includes('tu-proyecto') &&
    !rawUrl.includes('placeholder') &&
    !rawKey.includes('PEGA_AQUI') &&
    !rawKey.includes('placeholder')
  )
}


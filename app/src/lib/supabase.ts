import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * `true` cuando la app está conectada a un proyecto Supabase real.
 * Si es `false`, la app arranca en "modo demo" (datos de ejemplo en el
 * navegador) para que puedas verla funcionar antes de configurar la nube.
 */
export const isSupabaseConfigured = Boolean(
  url && anonKey && !url.includes('TU-PROYECTO'),
)

export const supabase = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null

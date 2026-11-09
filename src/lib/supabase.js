import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ SGICO: Variables de Supabase no configuradas. Revisa tu archivo .env')
}

// Tipo de enlace con el que se abrió la app (invitación o recuperación de
// contraseña). Se lee antes de crear el cliente, que limpia el hash de la URL.
export const tipoEnlaceInicial = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.hash.slice(1)).get('type')
  : null

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)

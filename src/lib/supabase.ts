import { createClient } from '@supabase/supabase-js'

// Fallbacks prevent build-time crashes when env vars aren't set (e.g. Vercel CI).
// The real values are always present at runtime in both dev and production.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseKey)

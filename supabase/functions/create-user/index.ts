import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VALID_ROLES = ['admin', 'reclutador', 'formador', 'visor']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No autorizado')

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const supabaseAdmin = createClient(supabaseUrl, serviceKey)

    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !caller) throw new Error('Sesión inválida')

    const { data: callerProfile } = await supabaseAdmin
      .from('perfiles')
      .select('rol')
      .eq('id', caller.id)
      .maybeSingle()

    if (callerProfile?.rol !== 'admin') {
      throw new Error('Solo administradores pueden crear usuarios')
    }

    const { email, password, nombre, rol } = await req.json()
    if (!email || !password) throw new Error('Email y contraseña son obligatorios')
    if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres')

    const safeRol = VALID_ROLES.includes(rol) ? rol : 'visor'
    const cleanEmail = String(email).trim().toLowerCase()
    const displayName = String(nombre || cleanEmail.split('@')[0]).trim()

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { nombre: displayName, rol: safeRol },
    })

    if (error) throw error

    await supabaseAdmin.from('perfiles').upsert({
      id: data.user.id,
      nombre: displayName,
      rol: safeRol,
    })

    return new Response(
      JSON.stringify({ user: { id: data.user.id, email: data.user.email, rol: safeRol } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

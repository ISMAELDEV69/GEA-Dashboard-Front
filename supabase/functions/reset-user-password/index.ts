import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // Verify caller is admin
    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !caller) throw new Error('Sesión inválida')

    const { data: callerProfile } = await supabaseAdmin
      .from('perfiles')
      .select('rol')
      .eq('id', caller.id)
      .maybeSingle()

    if (callerProfile?.rol !== 'admin') {
      throw new Error('Solo administradores pueden restablecer contraseñas')
    }

    const { userId, password } = await req.json()
    if (!userId || !password) throw new Error('Usuario y nueva contraseña son obligatorios')
    if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres')

    // Reset password using Admin API
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: password }
    )

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, message: 'Contraseña actualizada' }),
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

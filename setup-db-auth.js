import fs from 'fs'
import path from 'path'
import pkg from 'pg'
const { Client } = pkg

// Cargar DATABASE_URL desde .env.local o variables de entorno
let connectionString = process.env.DATABASE_URL

try {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const match = envContent.match(/^DATABASE_URL=(.+)$/m)
    if (match) {
      connectionString = match[1].trim()
    }
  }
} catch (e) {
  console.warn("⚠️ No se pudo leer .env.local, usando variables del sistema:", e.message)
}

if (!connectionString) {
  console.error("❌ ERROR: DATABASE_URL no está configurado en .env.local o en las variables de entorno.")
  process.exit(1)
}

async function run() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log("🔌 Conectando a la base de datos de Supabase...")
    await client.connect()
    console.log("✅ Conexión establecida.")

    console.log("🛠️ Creando tipos y tablas de roles/perfiles...")
    
    // 1. Tipo Enum para Roles
    await client.query(`
      DO $$ BEGIN
          CREATE TYPE app_role AS ENUM ('admin', 'reclutador', 'formador', 'visor');
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;
    `)

    // 2. Tabla perfiles
    await client.query(`
      CREATE TABLE IF NOT EXISTS perfiles (
          id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
          nombre VARCHAR(200) NOT NULL,
          rol app_role NOT NULL DEFAULT 'visor',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
      );
    `)

    // 3. Activar RLS
    await client.query(`ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;`)

    // 4. Políticas para la tabla perfiles
    await client.query(`
      DROP POLICY IF EXISTS select_perfiles ON perfiles;
      DROP POLICY IF EXISTS insert_perfiles ON perfiles;
      DROP POLICY IF EXISTS update_perfiles ON perfiles;

      CREATE POLICY select_perfiles ON perfiles FOR SELECT TO authenticated USING (true);
      CREATE POLICY insert_perfiles ON perfiles FOR INSERT TO authenticated WITH CHECK (true);
      CREATE POLICY update_perfiles ON perfiles FOR UPDATE TO authenticated USING (
          auth.uid() = id OR EXISTS (SELECT 1 FROM perfiles WHERE perfiles.id = auth.uid() AND perfiles.rol = 'admin')
      ) WITH CHECK (
          auth.uid() = id OR EXISTS (SELECT 1 FROM perfiles WHERE perfiles.id = auth.uid() AND perfiles.rol = 'admin')
      );
    `)

    // 5. RPC get_my_profile — crea perfil si falta al iniciar sesión
    await client.query(`
      CREATE OR REPLACE FUNCTION public.get_my_profile()
      RETURNS public.perfiles AS $$
      DECLARE
        result public.perfiles;
        v_meta jsonb;
        v_rol text;
      BEGIN
        SELECT * INTO result FROM public.perfiles WHERE id = auth.uid();
        IF FOUND THEN RETURN result; END IF;

        v_meta := COALESCE(auth.jwt()->'user_metadata', '{}'::jsonb);
        v_rol := v_meta->>'rol';

        INSERT INTO public.perfiles (id, nombre, rol)
        VALUES (
          auth.uid(),
          COALESCE(v_meta->>'nombre', split_part(COALESCE(auth.jwt()->>'email', ''), '@', 1), 'Usuario'),
          CASE
            WHEN v_rol IN ('admin', 'reclutador', 'formador', 'visor') THEN v_rol::app_role
            ELSE 'visor'::app_role
          END
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING * INTO result;

        IF NOT FOUND THEN
          SELECT * INTO result FROM public.perfiles WHERE id = auth.uid();
        END IF;

        RETURN result;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

      GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
    `)

    // 6. Trigger handle_new_user en auth.users
    await client.query(`
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS trigger AS $$
      DECLARE
        v_nombre text;
        v_rol text;
        v_role_enum app_role;
      BEGIN
        v_nombre := COALESCE(new.raw_user_meta_data->>'nombre', 'Usuario Nuevo');
        v_rol := new.raw_user_meta_data->>'rol';

        IF v_rol IS NOT NULL AND v_rol IN ('admin', 'reclutador', 'formador', 'visor') THEN
          v_role_enum := v_rol::app_role;
        ELSE
          v_role_enum := 'visor'::app_role;
        END IF;

        INSERT INTO public.perfiles (id, nombre, rol)
        VALUES (new.id, v_nombre, v_role_enum)
        ON CONFLICT (id) DO UPDATE
        SET nombre = EXCLUDED.nombre,
            rol = CASE
              WHEN perfiles.rol = 'visor' AND EXCLUDED.rol != 'visor' THEN EXCLUDED.rol
              ELSE perfiles.rol
            END;
        
        RETURN NEW;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.perfiles (id, nombre, rol)
        VALUES (new.id, COALESCE(new.email, 'Usuario Nuevo'), 'visor'::app_role)
        ON CONFLICT (id) DO NOTHING;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
    `)

    await client.query(`
      DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
      CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    `)

    console.log("🔒 Actualizando políticas de seguridad RLS de Postulantes...")
    await client.query(`
      DROP POLICY IF EXISTS select_postulantes ON postulantes;
      DROP POLICY IF EXISTS insert_postulantes ON postulantes;
      DROP POLICY IF EXISTS update_postulantes ON postulantes;

      CREATE POLICY select_postulantes ON postulantes FOR SELECT TO authenticated USING (true);
      
      CREATE POLICY insert_postulantes ON postulantes FOR INSERT TO authenticated WITH CHECK (
          EXISTS (SELECT 1 FROM perfiles WHERE perfiles.id = auth.uid() AND perfiles.rol IN ('admin', 'reclutador'))
      );
      
      CREATE POLICY update_postulantes ON postulantes FOR UPDATE TO authenticated USING (
          EXISTS (SELECT 1 FROM perfiles WHERE perfiles.id = auth.uid() AND perfiles.rol IN ('admin', 'reclutador'))
      ) WITH CHECK (
          EXISTS (SELECT 1 FROM perfiles WHERE perfiles.id = auth.uid() AND perfiles.rol IN ('admin', 'reclutador'))
      );
    `)

    console.log("🔒 Actualizando políticas de seguridad RLS de Asistencias...")
    await client.query(`
      DROP POLICY IF EXISTS select_asistencias ON asistencias_capacitacion;
      DROP POLICY IF EXISTS insert_asistencias ON asistencias_capacitacion;
      DROP POLICY IF EXISTS update_asistencias ON asistencias_capacitacion;
      DROP POLICY IF EXISTS delete_asistencias ON asistencias_capacitacion;

      CREATE POLICY select_asistencias ON asistencias_capacitacion FOR SELECT TO authenticated USING (true);
      
      CREATE POLICY insert_asistencias ON asistencias_capacitacion FOR INSERT TO authenticated WITH CHECK (
          EXISTS (SELECT 1 FROM perfiles WHERE perfiles.id = auth.uid() AND perfiles.rol IN ('admin', 'formador'))
      );
      
      CREATE POLICY update_asistencias ON asistencias_capacitacion FOR UPDATE TO authenticated USING (
          EXISTS (SELECT 1 FROM perfiles WHERE perfiles.id = auth.uid() AND perfiles.rol IN ('admin', 'formador'))
      ) WITH CHECK (
          EXISTS (SELECT 1 FROM perfiles WHERE perfiles.id = auth.uid() AND perfiles.rol IN ('admin', 'formador'))
      );
      
      CREATE POLICY delete_asistencias ON asistencias_capacitacion FOR DELETE TO authenticated USING (
          EXISTS (SELECT 1 FROM perfiles WHERE perfiles.id = auth.uid() AND perfiles.rol IN ('admin', 'formador'))
      );
    `)

    console.log("🎉 Esquema de perfiles y RLS para roles actualizado con éxito.")

  } catch (err) {
    console.error("❌ ERROR durante el setup:", err)
  } finally {
    await client.end()
    console.log("🔌 Conexión cerrada.")
  }
}

run()

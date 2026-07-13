const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    await client.connect();
    
    // 1. Asegurar columnas
    await client.query('ALTER TABLE descuentos ADD COLUMN IF NOT EXISTS procede VARCHAR(50);');
    await client.query('ALTER TABLE descuentos ADD COLUMN IF NOT EXISTS estado VARCHAR(50);');
    
    // 2. Intentar habilitar pg_cron (puede fallar si no hay permisos, pero asumo que supabase lo tiene)
    try { await client.query('CREATE EXTENSION IF NOT EXISTS pg_cron;'); } catch(e) {}
    
    // 3. Crear funcion
    const fn = `
CREATE OR REPLACE FUNCTION auto_aprobar_descuentos_vencidos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    r RECORD;
    limite timestamp;
    dias_agregados int;
    current_iter timestamp;
    audit_values jsonb;
BEGIN
    FOR r IN SELECT * FROM descuentos WHERE autoriza_rys = 'PENDIENTE' AND fecha_registro IS NOT NULL LOOP
        limite := date_trunc('day', r.fecha_registro);
        dias_agregados := 0;
        current_iter := limite;
        
        WHILE dias_agregados < 2 LOOP
            current_iter := current_iter + interval '1 day';
            IF EXTRACT(DOW FROM current_iter) <> 0 THEN
                dias_agregados := dias_agregados + 1;
            END IF;
        END LOOP;
        
        IF CURRENT_TIMESTAMP >= current_iter THEN
            UPDATE descuentos
            SET 
                autoriza_rys = 'SI',
                comentario_rys = 'APROBACION AUTOMATICA (48H)',
                fuera_de_plazo = 'SI',
                procede = 'PROCEDE',
                estado = 'PROCEDE'
            WHERE id = r.id;
            
            audit_values := jsonb_build_object(
                'estado', 'PROCEDE',
                'comentario', 'APROBACION AUTOMATICA (48H)',
                'procede', 'PROCEDE',
                'fuera_de_plazo', 'SI'
            );
            
            INSERT INTO audit_logs (
                tabla_afectada, operacion, id_registro, valores_anteriores, valores_nuevos, usuario_email, fecha
            ) VALUES (
                'descuentos',
                'AUTORIZAR_RYS_CRON',
                r.id::varchar,
                jsonb_build_object('autoriza_rys', 'PENDIENTE', 'estado', r.estado),
                audit_values,
                'sistema_cron',
                CURRENT_TIMESTAMP
            );
        END IF;
    END LOOP;
END;
$$;
    `;
    await client.query(fn);
    
    // 4. Programar cron
    try {
      await client.query("SELECT cron.unschedule('auto-aprobacion-diaria');");
    } catch(e) {
      // Ignorar error si no existe
    }
    
    await client.query(`
      SELECT cron.schedule(
          'auto-aprobacion-diaria',
          '0 23 * * *',
          $$SELECT auto_aprobar_descuentos_vencidos()$$
      );
    `);
    
    console.log("Cron job setup successfully!");
  } catch (err) {
    console.error("Error setting up DB:", err.message);
  } finally {
    await client.end();
  }
}
run();

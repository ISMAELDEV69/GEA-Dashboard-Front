const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    await client.connect();
    
    await client.query('ALTER TABLE descuentos ADD COLUMN IF NOT EXISTS autoriza_cap VARCHAR(50);');
    await client.query('ALTER TABLE descuentos ADD COLUMN IF NOT EXISTS bono VARCHAR(100);');
    await client.query('ALTER TABLE descuentos ADD COLUMN IF NOT EXISTS usuario_autoriza VARCHAR(255);');
    await client.query('ALTER TABLE descuentos ADD COLUMN IF NOT EXISTS fecha_autorizacion TIMESTAMP WITH TIME ZONE;');
    
    // Update cron function
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
                estado = 'PROCEDE',
                usuario_autoriza = 'sistema_cron',
                fecha_autorizacion = CURRENT_TIMESTAMP
            WHERE id = r.id;
            
            audit_values := jsonb_build_object(
                'estado', 'PROCEDE',
                'comentario', 'APROBACION AUTOMATICA (48H)',
                'procede', 'PROCEDE',
                'fuera_de_plazo', 'SI',
                'usuario_autoriza', 'sistema_cron'
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
    
    console.log("DB columns and function updated successfully!");
  } catch (err) {
    console.error("Error setting up DB:", err.message);
  } finally {
    await client.end();
  }
}
run();

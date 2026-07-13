const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

const query = `
-- 1. Asegurar que las columnas existan
ALTER TABLE descuentos ADD COLUMN IF NOT EXISTS procede VARCHAR(50);
ALTER TABLE descuentos ADD COLUMN IF NOT EXISTS estado VARCHAR(50);

-- 2. Habilitar extensión (puede fallar si no es superuser, por eso lo capturamos abajo o lo ignoramos)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 3. Crear la función principal
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
    -- Recorremos todos los pendientes
    FOR r IN SELECT * FROM descuentos WHERE autoriza_rys = 'PENDIENTE' AND fecha_registro IS NOT NULL LOOP
        -- Calculamos 2 días hábiles (excluyendo domingos)
        limite := date_trunc('day', r.fecha_registro);
        dias_agregados := 0;
        current_iter := limite;
        
        WHILE dias_agregados < 2 LOOP
            current_iter := current_iter + interval '1 day';
            -- 0 es Domingo en EXTRACT(DOW)
            IF EXTRACT(DOW FROM current_iter) <> 0 THEN
                dias_agregados := dias_agregados + 1;
            END IF;
        END LOOP;
        
        -- Si hoy superó el límite, lo auto-aprobamos
        IF CURRENT_TIMESTAMP >= current_iter THEN
            -- Hacemos el UPDATE en la tabla
            UPDATE descuentos
            SET 
                autoriza_rys = 'SI',
                comentario_rys = 'APROBACION AUTOMATICA (48H)',
                fuera_de_plazo = 'SI',
                procede = 'PROCEDE',
                estado = 'PROCEDE'
            WHERE id = r.id;
            
            -- Insertamos en el audit_logs
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

-- 4. Programar el CRON
-- Borramos si ya existe para evitar duplicados
SELECT cron.unschedule('auto-aprobacion-diaria');

-- Programamos todos los días a las 23:00 UTC (ajustable según la zona horaria del servidor, típicamente UTC. Si quieren 11 PM Perú, sería 04:00 UTC. Dejaremos 23:00 o 04:00 dependiendo de si prefieren UTC. Pondremos 23:00 por ahora).
SELECT cron.schedule(
    'auto-aprobacion-diaria',
    '0 23 * * *',
    $$SELECT auto_aprobar_descuentos_vencidos()$$
);

`;

async function run() {
  try {
    await client.connect();
    console.log("Connected. Executing setup...");
    await client.query(query);
    console.log("Cron job and functions created successfully.");
  } catch (err) {
    console.error("Error setting up DB:", err.message);
  } finally {
    await client.end();
  }
}
run();

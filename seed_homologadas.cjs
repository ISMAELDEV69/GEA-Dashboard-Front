require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const createTable = `
    CREATE TABLE IF NOT EXISTS opciones_homologadas (
      id SERIAL PRIMARY KEY,
      sede VARCHAR(100),
      segmento VARCHAR(100),
      campana VARCHAR(100),
      supervisor VARCHAR(100),
      motivo VARCHAR(100)
    );
  `;

  try {
    await client.query(createTable);
    console.log("Tabla opciones_homologadas creada o ya existe.");
    
    // Solo insertar si está vacía
    const check = await client.query(`SELECT COUNT(*) FROM opciones_homologadas`);
    if (parseInt(check.rows[0].count) === 0) {
      const insertSql = `
        INSERT INTO opciones_homologadas (sede, segmento, campana, supervisor, motivo) VALUES
        ('ATE', 'CLARO CHILE', 'POSTPAGO', 'PEDRO FLORES', 'OFRECIMIENTO DE CAMPAÑA'),
        ('ATE', 'CLARO CHILE', 'VTR', 'PEDRO FLORES', 'FACILIDADES TECNICAS'),
        ('ATE', 'CLARO CHILE', 'RETENCIONES CHILE', 'PEDRO FLORES', 'RYS - RETIRA'),
        ('ATE', 'CLARO CHILE', 'CONTENCIÓN', 'PEDRO FLORES', 'DOCUMENTOS INCOMPLETOS'),
        ('ATE', 'CLARO CHILE', 'BLINDAJE + BILLSHOCK', 'PEDRO FLORES', 'RRHH - RETIRA'),
        ('ATE', 'CLARO CHILE', 'ANULACIÓN', 'PEDRO FLORES', 'ESTUDIA DERECHO'),
        ('ATE', 'CLARO CHILE', 'TUVES BOLIVIA', 'PEDRO FLORES', 'SOBREDOTACIÓN'),
        ('JOCKEY', 'CLARO PERU', 'CLARO POSTPAGO', 'LESLIE RIVERA', 'BLACK LIST'),
        ('JOCKEY', 'CLARO PERU', 'CLARO PREPAGO', 'LESLIE RIVERA', 'GESTANTE'),
        ('JOCKEY', 'CLARO PERU', 'CLARO PREMIUM', 'LESLIE RIVERA', 'CAPACITACIÓN . RETIRA'),
        ('JOCKEY', 'CLARO PERU', 'CLARO ROAMING', 'LESLIE RIVERA', 'SALUD'),
        ('JOCKEY', 'CLARO PERU', 'CLARO POSTPAGO - CROSS', 'LESLIE RIVERA', 'PERSONALES'),
        ('JOCKEY', 'CLARO PERU OUT', 'MIGRACIONES ESPECIALES - OUT', 'ROBERTO SERNAQUE', 'PERFIL'),
        ('JOCKEY', 'CLARO PERU OUT', 'RENOVACIONES ESPECIALES - OUT', 'ROBERTO SERNAQUE', 'IPS NO DISPONIBLES'),
        ('JOCKEY', 'CLARO PERU OUT', 'RENOVACIONES ESPECIALES - WSP', 'ROBERTO SERNAQUE', 'PROBLEMAS CON EL CLIENTE'),
        ('JOCKEY', 'CLARO PERU OUT', 'RENOVACIONES ESPECIALES - WSP (EXPERIENCIA)', 'ROBERTO SERNAQUE', 'OPERACIONES . RETIRA'),
        ('JOCKEY', 'CLARO PERU OUT', 'RENOVACIONES ESPECIALES - OUT (EXPERIENCIA)', 'ROBERTO SERNAQUE', 'AGREGADO OBSERVADO POR FALTA'),
        ('JOCKEY', 'CLARO PERU OUT', 'UPGRADE', 'ROBERTO SERNAQUE', 'PERSONAL OBSERVADO'),
        ('JOCKEY', 'CLARO PERU OUT', 'OLAS', 'ROBERTO SERNAQUE', 'DESAPROBADO - CURSO EVALUAR'),
        ('JOCKEY', 'CLARO PERU OUT', 'LIVE CHAT', 'ROBERTO SERNAQUE', 'NO REALIZO - CURSO EVALUAR'),
        ('JOCKEY', 'CLARO PERU OUT', 'CROSS - OUT', 'ROBERTO SERNAQUE', 'DICCION'),
        ('JOCKEY', 'CLARO PERU OUT', 'LA FIJA + PORTABILIDAD MOVIL', 'ROBERTO SERNAQUE', 'ESTUDIOS'),
        ('COMAS', 'CLARO PERU RETENCIONES', 'PREVENTIVA - OUT', 'JHOJAN SALVADOR', 'DISTANCIA'),
        ('COMAS', 'CLARO PERU RETENCIONES', 'CONTACTADOS', 'JHOJAN SALVADOR', 'FALTA DOCUMENTACION'),
        ('SAN ISIDRO', 'CLARO PERU RETENCIONES', 'RETENCIONES INBOUND', 'LUIS RIVAS', 'POR DISCAPACIDAD'),
        ('SAN ISIDRO', 'CLARO PERU RETENCIONES', 'CONSULTA PREVIA', 'LUIS RIVAS', 'DEMORA DE INSTALACION DE VPN'),
        ('COMAS', 'CLARO PERU RETENCIONES', 'CANAL DIGITAL WSP INBOUND', 'JHOJAN SALVADOR', ''),
        ('SAN ISIDRO', 'CLARO PERU RETENCIONES', 'MI CLARO', 'LUIS RIVAS', ''),
        ('COMAS', 'CLARO PERU RETENCIONES', 'ENCUESTAS IZO', 'JHOJAN SALVADOR', ''),
        ('COMAS', 'CLARO PERU RETENCIONES', 'BABYSTING', 'JHOJAN SALVADOR', ''),
        ('ATE', 'LIPIGAS', 'TUVES', 'JUNIOR SERNAQUE', ''),
        ('ATE', 'LIPIGAS', 'TUVES BOLIVIA', 'JUNIOR SERNAQUE', ''),
        ('ATE', 'LIPIGAS', 'LIPIGAS SAC', 'JUNIOR SERNAQUE', ''),
        ('ATE', 'LIPIGAS', 'LIPIGAS TPE', 'JUNIOR SERNAQUE', ''),
        ('ATE', 'LIPIGAS', 'LIPIGAS GRANEL', 'JUNIOR SERNAQUE', ''),
        ('ATE', 'LIPIGAS', 'LIMAGAS', 'JUNIOR SERNAQUE', ''),
        ('ATE', 'LIPIGAS', 'LIPIGAS COBRANZAS', 'JUNIOR SERNAQUE', ''),
        ('JOCKEY', 'CLARO PERU', 'CLARO POSTPAGO', 'JESUS NAVARRO', ''),
        ('JOCKEY', 'CLARO PERU', 'CLARO PREPAGO', 'JESUS NAVARRO', ''),
        ('JOCKEY', 'CLARO PERU', 'CLARO PREMIUM', 'JESUS NAVARRO', ''),
        ('JOCKEY', 'CLARO PERU', 'CLARO ROAMING', 'JESUS NAVARRO', ''),
        ('JOCKEY', 'CLARO PERU', 'CLARO POSTPAGO - CROSS', 'JESUS NAVARRO', ''),
        ('JOCKEY', 'CLARO PERU', 'RETENCIONES FIJA INBOUND', 'JESUS NAVARRO', ''),
        ('JOCKEY', 'CLARO PERU', 'RETENCIONES FIJA INBOUND', 'LESLIE RIVERA', ''),
        ('ATE', 'LIPIGAS', 'TUVES PERÚ', 'JUNIOR SERNAQUE', '')
      `;
      await client.query(insertSql);
      console.log("Datos iniciales insertados en opciones_homologadas.");
    }
  } catch (err) {
    console.error("Error migrating homologadas:", err);
  } finally {
    await client.end();
  }
}

migrate();

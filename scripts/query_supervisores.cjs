const TOKEN = 'sbp_b04ec022d3dd31597d39429bf63ae2c334e6e3cc';
const PROJECT_ID = 'lqvvhovfvwzaprdgdobc';

async function main() {
  const query = `
    SELECT p.id, p.nombre, p.rol, p.cargo, p.formador_documento, ef.segmento AS segmento_equipo
    FROM perfiles p
    LEFT JOIN equipo_formacion ef ON (p.formador_documento = ef.documento OR p.nombre ILIKE '%' || ef.nombres_completos || '%')
    WHERE p.rol = 'supervisor_capacitacion'
    ORDER BY p.nombre;
  `;

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);

const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

const links = [
  { nombre: 'Asistencia', url: 'https://app.powerbi.com/view?r=eyJrIjoiNDdkOTAyZDMtYzJjMS00NGZjLThkNGUtMzM4NDFmZmM0MTkxIiwidCI6ImNkNjM5OGE3LTNjNTMtNGM2Yy04MWRkLTViMjhhMjgxNDExZiIsImMiOjR9' },
  { nombre: 'Deserción', url: 'https://app.powerbi.com/view?r=eyJrIjoiYWRkNTA1MzctODg1Yy00M2M2LTkwMWYtZjZiYWRkY2FkODAyIiwidCI6ImNkNjM5OGE3LTNjNTMtNGM2Yy04MWRkLTViMjhhMjgxNDExZiIsImMiOjR9' },
  { nombre: 'Reclutamiento', url: 'https://app.powerbi.com/view?r=eyJrIjoiNjA2YmMwZDMtZDUyNy00MjViLWJlNTUtMzc1OTExYjk4NTFjIiwidCI6ImNkNjM5OGE3LTNjNTMtNGM2Yy04MWRkLTViMjhhMjgxNDExZiIsImMiOjR9' },
  { nombre: 'Satisfacción', url: 'https://app.powerbi.com/view?r=eyJrIjoiNGJmN2VlZTQtZTI1YS00NTE4LTk2N2EtNWQ0ZmQzYzA5MTQ4IiwidCI6ImNkNjM5OGE3LTNjNTMtNGM2Yy04MWRkLTViMjhhMjgxNDExZiIsImMiOjR9' },
  { nombre: 'Control (Sheets)', url: 'https://docs.google.com/spreadsheets/u/2/d/1GNbzbpIDbueydVqOQr-D032Pma1L9FkHf-JPsU9Qi1s/edit?gid=249081259#gid=249081259' },
  { nombre: 'Cobertura', url: 'https://app.powerbi.com/view?r=eyJrIjoiMDFhZGU1YjMtYWZjNy00YTMwLWIyNjItODNjNjVlNGM2OWRhIiwidCI6ImNkNjM5OGE3LTNjNTMtNGM2Yy04MWRkLTViMjhhMjgxNDExZiIsImMiOjR9' },
  { nombre: 'Headcount', url: 'https://app.powerbi.com/view?r=eyJrIjoiZTNjOTU1NGQtODY0Mi00NmY0LWJiNjEtMjgxZjJlM2IxZTM3IiwidCI6ImNkNjM5OGE3LTNjNTMtNGM2Yy04MWRkLTViMjhhMjgxNDExZiIsImMiOjR9' },
  { nombre: 'Plan Cobertura', url: 'https://app.powerbi.com/view?r=eyJrIjoiZTVhZThlODgtYjFhMi00NDgyLTg1MDUtYWU2ZWE0NjBiYzliIiwidCI6ImNkNjM5OGE3LTNjNTMtNGM2Yy04MWRkLTViMjhhMjgxNDExZiIsImMiOjR9' }
];

const roles = JSON.stringify(["admin", "formador", "reclutador", "visor"]);

async function run() {
  try {
    await client.connect();
    console.log("Connected");
    
    // Clear existing to prevent duplicates
    await client.query('DELETE FROM dashboards_links');
    
    for (const link of links) {
      await client.query(
        'INSERT INTO dashboards_links (nombre, url, roles) VALUES ($1, $2, $3)',
        [link.nombre, link.url, roles]
      );
    }
    console.log("Inserted 8 dashboards.");
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();

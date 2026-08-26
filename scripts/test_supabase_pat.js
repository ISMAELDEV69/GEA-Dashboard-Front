const TOKEN = 'sbp_b04ec022d3dd31597d39429bf63ae2c334e6e3cc'

async function testManagement() {
  console.log('Testing Supabase Management API with Personal Access Token...')
  const res = await fetch('https://api.supabase.com/v1/projects', {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    }
  })
  
  if (!res.ok) {
    console.error('Error HTTP:', res.status, await res.text())
    return
  }

  const projects = await res.json()
  console.log('✅ Proyectos accesibles con este Token:')
  projects.forEach(p => {
    console.log(`- ID: ${p.id} | Nombre: "${p.name}" | Región: ${p.region} | Estado: ${p.status}`)
  })
}

testManagement().catch(console.error)

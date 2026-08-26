const TOKEN = 'sbp_b04ec022d3dd31597d39429bf63ae2c334e6e3cc'
const PROJECT_ID = 'lqvvhovfvwzaprdgdobc'

export async function executeSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`SQL Execution Error [${res.status}]: ${err}`)
  }

  return await res.json()
}

// CLI Test
if (process.argv[2]) {
  const sql = process.argv.slice(2).join(' ')
  executeSql(sql)
    .then(data => console.log(JSON.stringify(data, null, 2)))
    .catch(err => console.error(err.message))
}

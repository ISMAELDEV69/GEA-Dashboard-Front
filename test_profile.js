import { fetchUserProfile } from './src/lib/dataService.js'

async function run() {
  const profile = await fetchUserProfile('c8da4272-37c1-4312-acc4-243b51d27215')
  console.log('Profile:', profile)
}
run()

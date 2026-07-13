require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'pe_pasachoadp@alix.com',
    password: 'pe_pasachoadp'
  });
  console.log(error ? error.message : "Logged in successfully!");
}
run();

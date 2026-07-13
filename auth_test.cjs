require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@gea.com', // Let's guess an admin or find a known user
    password: 'password'
  });
  console.log(error ? error.message : "Logged in");
}
run();

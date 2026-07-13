const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL || 'https://jysqefwomzshszqddhcf.supabase.co', process.env.VITE_SUPABASE_ANON_KEY || 'dummy');
async function test() {
  const { data, error } = await supabase.rpc('test_http_proxy');
  console.log(data, error);
}
test();

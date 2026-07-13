const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('consolidado_asistencias')
    .select('*')
    .limit(1);
    
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  if (data && data.length > 0) {
    const cols = Object.keys(data[0]);
    console.log("SELECT " + cols.map(c => `"${c}"`).join(", ") + " FROM consolidado_asistencias;");
  } else {
    console.log("Table is empty, cannot infer all columns via REST if there are no rows without using OpenAPI meta.");
  }
}
run();

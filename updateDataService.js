const fs = require('fs');
const file = 'src/lib/dataService.js';
let content = fs.readFileSync(file, 'utf8');

const newCode = `
export async function adminResetUserPassword(userId, newPassword) {
  if (DB_MODE !== 'supabase') throw new Error('Solo disponible en Supabase.');
  
  // First try RPC
  const { error: rpcError } = await supabase.rpc('admin_update_user_password', {
    p_user_id: userId,
    p_password: newPassword
  });
  
  if (!rpcError) return true;
  
  const rpcMsg = rpcError?.message || '';
  if (!rpcMsg.includes('admin_update_user_password') && !rpcMsg.includes('does not exist') && !rpcMsg.includes('Could not find')) {
    throw new Error(rpcMsg);
  }
  
  // Try edge function fallback
  const { data, error } = await supabase.functions.invoke('reset-user-password', {
    body: { userId, password: newPassword }
  });
  
  if (error) throw new Error(error.message);
  return data;
}
`;

if (!content.includes('adminResetUserPassword')) {
    content = content.replace('export async function createUserAccount', newCode + '\nexport async function createUserAccount');
    fs.writeFileSync(file, content);
    console.log("dataService.js updated.");
} else {
    console.log("dataService.js already updated.");
}

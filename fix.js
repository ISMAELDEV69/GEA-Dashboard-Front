const fs = require('fs');
const file = 'src/components/AsistenciaForm.jsx';
let content = fs.readFileSync(file, 'utf8');

// The file has syntax errors right now. Let's find the problematic part.
// The file should have `</tr> ) }) : ( <tr> <td colSpan="15"` ...
// Since replace_file_content butchered it, I will just rewrite the `renderTable` return part completely using a known good state.

console.log(content.split('\n').slice(1020, 1080).join('\n'));

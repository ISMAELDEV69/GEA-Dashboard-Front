const fs = require('fs');
let content = fs.readFileSync('scripts/rebuild_view.js', 'utf8');
content = content.replace(/cr\.condicion_laboral\s+AS/g, "cr.condicion AS");
fs.writeFileSync('scripts/rebuild_view.js', content);

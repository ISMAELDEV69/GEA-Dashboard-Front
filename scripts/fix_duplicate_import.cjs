const fs = require('fs');
let content = fs.readFileSync('src/lib/dataService.js', 'utf8');

// Replace multiple instances of import * as XLSX with just one
content = content.replace(/import \* as XLSX from ['"]xlsx['"];?\n?/g, '');
content = "import * as XLSX from 'xlsx';\n" + content;

fs.writeFileSync('src/lib/dataService.js', content);
console.log('Fixed XLSX imports');

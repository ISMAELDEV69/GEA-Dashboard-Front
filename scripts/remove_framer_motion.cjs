const fs = require('fs');

let content = fs.readFileSync('src/pages/NominaCompletar.jsx', 'utf8');

// Remove import
content = content.replace(/import \{ motion \} from 'framer-motion'\n/g, '');

// Replace <motion.div ...> with <div className="animate-fadeIn">
content = content.replace(
  /<motion\.div[\s\S]+?>/,
  '<div className="animate-fadeIn">'
)
content = content.replace(/<\/motion\.div>/g, '</div>');

fs.writeFileSync('src/pages/NominaCompletar.jsx', content);
console.log('Removed framer-motion');

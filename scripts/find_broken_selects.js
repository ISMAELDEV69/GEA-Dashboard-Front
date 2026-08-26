import fs from 'fs';
import path from 'path';

function findSelects(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      findSelects(fullPath);
    } else if (file.name.endsWith('.js') || file.name.endsWith('.jsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('.from(') || line.includes('.select(')) {
          if (line.includes('cargo') || line.includes('periodo') || line.includes('tipo_baja')) {
            console.log(`${fullPath}:${i + 1}: ${line.trim()}`);
          }
        }
      }
    }
  }
}

findSelects('./src');

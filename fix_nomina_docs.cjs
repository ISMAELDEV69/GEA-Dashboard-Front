const fs = require('fs');
const file = 'src/components/nomina/NominaGridEditor.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/{ key: 'doc_cv'.*/, "{ key: 'doc_cv', label: 'CV', width: 80, type: 'select', options: ['OK', 'PENDIENTE'] },");
content = content.replace(/{ key: 'doc_dni_adjunto'.*/, "{ key: 'doc_dni_adjunto', label: 'DNI (ADJUNTO)', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },");
content = content.replace(/{ key: 'doc_certijoven'.*/, "{ key: 'doc_certijoven', label: 'CERTIJOVEN', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },");
content = content.replace(/{ key: 'doc_recibo_servicios'.*/, "{ key: 'doc_recibo_servicios', label: 'RECIBO SERV.', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },");
content = content.replace(/{ key: 'doc_ficha_datos'.*/, "{ key: 'doc_ficha_datos', label: 'FICHA DATOS', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },");
content = content.replace(/{ key: 'doc_autorizacion'.*/, "{ key: 'doc_autorizacion', label: 'AUTORIZACIÓN', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },");
content = content.replace(/{ key: 'status_final'.*/, "{ key: 'status_final', label: 'STATUS FINAL', width: 120, type: 'select', options: ['COMPLETO', 'PENDIENTE'] }");

fs.writeFileSync(file, content);
console.log('Fixed array');

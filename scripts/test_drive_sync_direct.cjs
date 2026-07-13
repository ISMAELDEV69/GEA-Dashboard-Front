const fs = require('fs');
const https = require('https');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR5cIgvA11b8Xczt-fwGREZ9XPWMXxPq5OTpNMXgaiU3jEMWD4FwVjAdFpDX5V3fI5lXEQST8S_vI70/pub?output=csv';

https.get(csvUrl, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    fs.writeFileSync('scripts/capacidad_rys_test.csv', data);
    console.log('Downloaded CSV. Lines:', data.split('\n').length);
  });
}).on('error', (err) => {
  console.log("Error: " + err.message);
});

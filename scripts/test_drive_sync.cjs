const fs = require('fs');

async function test() {
  try {
     const { importCapacidadRysBulk } = await import('../src/lib/dataService.js');
     const { fetchCapacidadRysFromDrive } = await import('../src/lib/capacidadRysSync.js');

     console.log('Fetching from drive...');
     const result = await fetchCapacidadRysFromDrive();
     if (result.errors && result.errors.length > 0) {
       console.log('Got errors:', result.errors[0]);
     } else {
       console.log('Success:', result);
     }
  } catch(e) {
     console.error(e);
  }
}
test();

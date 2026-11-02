/**
 * Utilidad de exportación y lectura de Excel con Dynamic Import
 * Carga 'xlsx' bajo demanda (lazy loading) solo cuando el usuario hace clic en Exportar o Sube un archivo,
 * reduciendo más de 420 kB del bundle inicial de la plataforma.
 */

export async function getXLSX() {
  return await import('xlsx');
}

export async function exportToExcel(rows, fileName = 'Reporte.xlsx', sheetName = 'Datos') {
  if (!rows || !rows.length) {
    throw new Error('No hay datos para exportar.');
  }

  const XLSX = await getXLSX();

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const finalName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(wb, finalName);
  return true;
}

export async function readExcelMatrix(file, options = {}) {
  const XLSX = await getXLSX();
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array', cellText: true, cellDates: true, ...options });
  return { wb, XLSX };
}

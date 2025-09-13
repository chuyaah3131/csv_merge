export function saveAs(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadJSON(data: any, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  saveAs(blob, filename);
}

export function downloadCSV(data: string[][], filename: string): void {
  const csvContent = data.map(row => 
    row.map(cell => `"${cell}"`).join(',')
  ).join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv' });
  saveAs(blob, filename);
}

export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/plain' });
  saveAs(blob, filename);
}

// Create compressed exports
export async function saveAsCompressed(data: string, filename: string): Promise<void> {
  // Dynamic import to keep bundle size small
  const pako = await import('pako');
  
  const compressed = pako.gzip(data);
  const blob = new Blob([compressed], { type: 'application/gzip' });
  
  saveAs(blob, filename + '.gz');
}
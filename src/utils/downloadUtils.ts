/**
 * Triggers a file download in the browser by creating a temporary anchor element.
 * Centralises the 4-way duplicated createObjectURL→click→revokeObjectURL pattern.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

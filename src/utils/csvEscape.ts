/**
 * RFC 4180 field/row escaping, shared by the CSV tool's export and Mock Data's
 * CSV output — both need the exact same quoting rule and there is no reason to
 * write it twice.
 */
export function escapeCsvField(value: string, delimiter: string): string {
  const needsQuoting = value.includes(delimiter) || value.includes('"') || /[\r\n]/.test(value);
  if (!needsQuoting) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function stringifyCsvRow(fields: readonly string[], delimiter: string): string {
  return fields.map((field) => escapeCsvField(field, delimiter)).join(delimiter);
}

export function stringifyCsvTable(rows: readonly (readonly string[])[], delimiter: string): string {
  return rows.map((row) => stringifyCsvRow(row, delimiter)).join('\r\n');
}

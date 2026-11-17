/**
 * Counts data records in a CSV, ignoring the header row.
 *
 * Quote-aware, because wine names and tasting notes contain commas and
 * newlines inside quoted fields — a naive line count over-reports.
 */
export function countRecords(csv: string): number {
  let records = 0;
  let inQuotes = false;
  let sawContent = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];

    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') i++; // escaped quote
        else inQuotes = false;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      sawContent = true;
    } else if (char === '\n') {
      if (sawContent) records++;
      sawContent = false;
    } else if (char !== '\r') {
      sawContent = true;
    }
  }

  if (sawContent) records++;

  return Math.max(0, records - 1); // drop the header
}

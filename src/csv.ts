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

export type Row = Record<string, string>;

/**
 * Parses a CSV into row objects keyed by the header.
 *
 * Handles quoted fields containing commas, newlines and doubled quotes, plus
 * CRLF endings and a leading byte-order mark.
 */
export function parseCsv(csv: string): Row[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let started = false;

  const endField = () => {
    record.push(field);
    field = '';
    started = true;
  };
  const endRecord = () => {
    endField();
    if (record.length > 1 || record[0] !== '') records.push(record);
    record = [];
    started = false;
  };

  const text = csv.startsWith('﻿') ? csv.slice(1) : csv;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ',') endField();
    else if (char === '\n') endRecord();
    else if (char !== '\r') field += char;
  }

  if (field !== '' || started || record.length > 0) endRecord();

  const [header, ...body] = records;
  if (!header) return [];

  return body.map((values) => {
    const row: Row = {};
    header.forEach((name, index) => {
      row[name] = values[index] ?? '';
    });
    return row;
  });
}

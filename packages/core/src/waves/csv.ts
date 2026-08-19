// waves context — CSV parsing for Ola ingestion.
//
// The roster CSV the Empresa Cliente's admin brings: a header row naming the
// columns RUT, nombre, teléfono and correo (accents and case tolerated, extra
// columns ignored, column order free), then one Trabajador per line. Fields may
// be double-quoted per RFC 4180.
import { emailSchema } from '../types/schemas/index.js';
import type { WorkerRow } from './model.js';

export interface WaveCsvIssue {
  row: number;
  column: string;
  message: string;
}

/** The roster text is not a valid Ola CSV. `issues` names every offending row
 *  and column so the admin can fix the file in one pass. */
export class WaveCsvError extends Error {
  readonly issues: WaveCsvIssue[];

  constructor(issues: WaveCsvIssue[]) {
    super(
      `invalid Ola CSV: ${issues.map((i) => `row ${i.row} (${i.column}) ${i.message}`).join('; ')}`,
    );
    this.name = 'WaveCsvError';
    this.issues = issues;
  }
}

const REQUIRED_COLUMNS = ['rut', 'nombre', 'telefono', 'correo'] as const;

function normalizeColumn(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** RFC 4180 field-level split: double quotes escape commas and themselves. */
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function splitName(nombre: string): { firstName: string; lastName: string | null } {
  // "López, María" (surname-comma-given) arrives as one quoted field; flip it
  // so the given name is the firstName, same as the space-separated default.
  const commaForm = nombre.match(/^([^,]+),\s*(.+)$/);
  const parts = (commaForm ? `${commaForm[2]} ${commaForm[1]}` : nombre).trim().split(/\s+/);
  const [firstName, ...rest] = parts;
  return { firstName: firstName!, lastName: rest.length > 0 ? rest.join(' ') : null };
}

export function parseWorkerCsv(text: string): WorkerRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new WaveCsvError([
      {
        row: 1,
        column: 'csv',
        message: 'a header row and at least one Trabajador row are required',
      },
    ]);
  }

  const header = parseLine(lines[0]!).map(normalizeColumn);
  const columnOf = new Map<string, number>();
  header.forEach((column, index) => {
    if (!columnOf.has(column)) {
      columnOf.set(column, index);
    }
  });
  const missing = REQUIRED_COLUMNS.filter((column) => !columnOf.has(column));
  if (missing.length > 0) {
    throw new WaveCsvError(
      missing.map((column) => ({
        row: 1,
        column,
        message: 'required column is missing from the header',
      })),
    );
  }

  const issues: WaveCsvIssue[] = [];
  const rows: WorkerRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseLine(lines[i]!);
    const cell = (column: string) => (fields[columnOf.get(column)!] ?? '').trim();
    const rowNumber = i + 1;

    const rut = cell('rut');
    const nombre = cell('nombre');
    const phone = cell('telefono');
    const correo = cell('correo');

    if (rut.length === 0) {
      issues.push({ row: rowNumber, column: 'rut', message: 'is empty' });
    }
    if (nombre.length === 0) {
      issues.push({ row: rowNumber, column: 'nombre', message: 'is empty' });
    }
    if (phone.length === 0) {
      issues.push({ row: rowNumber, column: 'telefono', message: 'is empty' });
    }
    if (!emailSchema.safeParse(correo).success) {
      issues.push({
        row: rowNumber,
        column: 'correo',
        message: `"${correo}" is not a valid email`,
      });
    }
    if (issues.length > 0) {
      continue;
    }

    rows.push({ rut, ...splitName(nombre), phone, email: correo });
  }
  if (issues.length > 0) {
    throw new WaveCsvError(issues);
  }
  return rows;
}

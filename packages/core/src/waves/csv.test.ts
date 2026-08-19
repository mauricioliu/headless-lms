import { describe, expect, it } from 'vitest';
import { parseWorkerCsv, WaveCsvError } from './csv.js';

describe('parseWorkerCsv', () => {
  it('maps columns by header name, tolerating accents, case and order', () => {
    const rows = parseWorkerCsv(
      [
        'CORREO,teléfono , NOMBRE ,RUT',
        'juana.perez@faena.test,+56 9 8123 4567,Juana Pérez Rojas,12.345.678-5',
      ].join('\n'),
    );
    expect(rows).toEqual([
      {
        rut: '12.345.678-5',
        firstName: 'Juana',
        lastName: 'Pérez Rojas',
        phone: '+56 9 8123 4567',
        email: 'juana.perez@faena.test',
      },
    ]);
  });

  it('handles RFC 4180 quoted fields, CRLF, a BOM and blank lines', () => {
    const rows = parseWorkerCsv(
      '\uFEFFRUT,Nombre,Teléfono,Correo\r\n\r\n1-9,"López, María",+56 9 5555 6666,maria.lopez@faena.test\r\n',
    );
    expect(rows).toEqual([
      {
        rut: '1-9',
        firstName: 'María',
        lastName: 'López',
        phone: '+56 9 5555 6666',
        email: 'maria.lopez@faena.test',
      },
    ]);
  });
  it('leaves lastName null for a single-token nombre', () => {
    const rows = parseWorkerCsv(
      'RUT,Nombre,Teléfono,Correo\n1-9,Pedro,+56961234567,pedro@faena.test',
    );
    expect(rows[0]).toMatchObject({ firstName: 'Pedro', lastName: null });
  });

  it('reports every bad row and column at once', () => {
    try {
      parseWorkerCsv(
        'RUT,Nombre,Teléfono,Correo\n,Alguien,+569,no-tiene-arroba\n,,-56 9 1,tampoco',
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WaveCsvError);
      const issues = (err as WaveCsvError).issues;
      expect(issues).toEqual([
        { row: 2, column: 'rut', message: 'is empty' },
        { row: 2, column: 'correo', message: '"no-tiene-arroba" is not a valid email' },
        { row: 3, column: 'rut', message: 'is empty' },
        { row: 3, column: 'nombre', message: 'is empty' },
        { row: 3, column: 'correo', message: '"tampoco" is not a valid email' },
      ]);
    }
  });

  it('rejects a header missing required columns', () => {
    try {
      parseWorkerCsv('RUT,Nombre,Telefono\n1-9,Alguien,+569');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WaveCsvError);
      expect((err as WaveCsvError).issues).toEqual([
        { row: 1, column: 'correo', message: 'required column is missing from the header' },
      ]);
    }
  });

  it('rejects a CSV with no data rows', () => {
    try {
      parseWorkerCsv('RUT,Nombre,Telefono,Correo');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WaveCsvError);
      expect((err as WaveCsvError).issues[0]?.message).toContain('at least one Trabajador');
    }
  });
});

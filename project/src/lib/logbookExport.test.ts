import { describe, expect, it } from 'vitest';
import { ageBand, buildLogbookTable, HpeInfo, LogbookExportRow } from './logbookExport';
import { Patient, Surgery } from './types';

const patient = { id: 'p1', patient_name: 'Ravi Kumar', unique_id: 'NMCH-0423', age: 47, sex: 'male', diagnosis: 'Right inguinal hernia' } as Patient;
const surgery = {
  id: 's1', patient_id: 'p1', procedure_name: 'Lichtenstein repair', procedure_category: 'Major', role: 'done_by_me',
  anaesthesia_type: 'Spinal', outcome: 'Uneventful', clavien_dindo: 'I', surgery_date: '2026-10-05',
} as Surgery;
const rows: LogbookExportRow[] = [{ surgery, patient, hospital: { id: 'h', user_id: 'u', name: 'NMCH', created_at: '' } }];
const hpe = new Map<string, HpeInfo>([['p1', { report_number: 'HP/1234/26', findings: 'Hernial sac, no malignancy', report_image_paths: [] }]]);

describe('logbook export', () => {
  it('bands ages by decade', () => {
    expect(ageBand(47)).toBe('40–49');
    expect(ageBand(0)).toBe('0–9');
    expect(ageBand(null)).toBe('');
  });

  it('keeps identifiers in the normal export', () => {
    const text = JSON.stringify(buildLogbookTable(rows, hpe));
    expect(text).toContain('Ravi Kumar');
    expect(text).toContain('NMCH-0423');
    expect(text).toContain('HP/1234/26');
  });

  it('removes every direct identifier when anonymised', () => {
    const [header, row] = buildLogbookTable(rows, hpe, true);
    const text = JSON.stringify([header, row]);
    for (const id of ['Ravi Kumar', 'NMCH-0423', 'HP/1234/26', '05/10/2026', '05 Oct 2026']) expect(text).not.toContain(id);
    expect(row.slice(1, 5)).toEqual(['C001', 'Oct 2026', '40–49', 'M']);
    expect(row).toContain('Grade I');
    expect(row).toContain('Hernial sac, no malignancy');
  });
});

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Hospital, Patient, Surgery } from './types';
import { formatDate, isHpeAwaiting, todayLocalDateStr } from './helpers';
import { formatMonth } from './fees';
import { clavienLabel } from './complications';

export interface LogbookExportRow {
  surgery: Surgery;
  patient: Patient | null;
  hospital: Hospital | null;
}

export interface HpeInfo {
  report_number: string;
  findings: string | null;
  report_image_paths: string[] | null;
}

const CATEGORY_COLUMNS = ['Major', 'Minor', 'Bedside', 'Endoscopy', 'Others'] as const;

const sexShort = (s: string | null | undefined) => (s ? s.charAt(0).toUpperCase() : '');

function hpeText(h: HpeInfo | undefined, anonymise = false): string {
  if (!h) return 'Not sent';
  // Lab report numbers can be traced back to a patient, so drop them when anonymising.
  const ref = anonymise ? '' : h.report_number;
  if (isHpeAwaiting(h)) return `Awaiting${ref ? ` (${ref})` : ''}`;
  const report = (h.findings || '').replace(/\s+/g, ' ').trim();
  return [ref, report || 'Report scanned'].filter(Boolean).join(' — ');
}

/** Ten-year age band, e.g. 47 -> "40–49"; blank when age is unknown. */
export function ageBand(age: number | null | undefined): string {
  if (age === null || age === undefined || Number.isNaN(age)) return '';
  const lo = Math.floor(age / 10) * 10;
  return `${lo}–${lo + 9}`;
}

const monthYear = (date: string) => {
  const [y, m] = date.substring(0, 10).split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};

const byDate = (rows: LogbookExportRow[]) =>
  [...rows].sort((a, b) => (a.surgery.surgery_date || '').localeCompare(b.surgery.surgery_date || ''));

/**
 * Logbook table (header + one numbered row per case, in date order). With
 * anonymise on, direct identifiers are removed: no name, hospital case ID or
 * lab report number; age becomes a 10-year band and the date becomes month
 * and year. Each case gets a study ID (C001, C002...) instead.
 */
export function buildLogbookTable(rows: LogbookExportRow[], hpeByPatient: Map<string, HpeInfo>, anonymise = false): (string | number)[][] {
  const header = anonymise
    ? ['S.No', 'Study ID', 'Month', 'Age band', 'Sex', 'Hospital', 'Diagnosis', 'Procedure', 'Type', 'Role', 'Anaesthesia', 'Outcome', 'Complication', 'HPE']
    : ['S.No', 'Date', 'Patient Name', 'Age/Sex', 'Case ID', 'Hospital', 'Diagnosis', 'Procedure', 'Type', 'Role', 'Anaesthesia', 'Outcome', 'Complication', 'HPE'];
  const body = byDate(rows).map((r, i) => {
    const date = r.surgery.surgery_date;
    const who = anonymise
      ? [`C${String(i + 1).padStart(3, '0')}`, date ? monthYear(date) : '', ageBand(r.patient?.age), sexShort(r.patient?.sex)]
      : [
        date ? formatDate(date) : '',
        r.patient?.patient_name || '',
        [r.patient?.age ?? '', sexShort(r.patient?.sex)].filter((v) => v !== '').join('/'),
        r.patient?.unique_id || '',
      ];
    return [
      i + 1,
      ...who,
      r.hospital?.name || '',
      r.patient?.diagnosis || '',
      r.surgery.procedure_name || '',
      r.surgery.procedure_category || '',
      r.surgery.role === 'assisted_by_me' ? 'Assisted' : 'Performed',
      r.surgery.anaesthesia_type || '',
      r.surgery.outcome || '',
      clavienLabel(r.surgery.clavien_dindo),
      hpeText(r.patient ? hpeByPatient.get(r.patient.id) : undefined, anonymise),
    ];
  });
  return [header, ...body];
}

// Logbook in the usual university/board register layout: one numbered row
// per case in date order, plus a month-wise summary with a column left
// blank for the supervisor's signature.
export function exportLogbookExcel(
  rows: LogbookExportRow[],
  hpeByPatient: Map<string, HpeInfo>,
  meta: { doctorName: string; qualifications: string },
  anonymise = false,
) {
  const sorted = byDate(rows);
  const title = [anonymise ? 'Surgical Logbook (anonymised)' : 'Surgical Logbook', [meta.doctorName.trim(), meta.qualifications.trim()].filter(Boolean).join(', ')];
  const logSheet = XLSX.utils.aoa_to_sheet([title, [], ...buildLogbookTable(rows, hpeByPatient, anonymise)]);
  logSheet['!cols'] = [6, 12, 22, 8, 12, 18, 26, 30, 10, 10, 12, 22, 16, 30].map((wch) => ({ wch }));

  const byMonth = new Map<string, LogbookExportRow[]>();
  sorted.forEach((r) => {
    const m = r.surgery.surgery_date ? r.surgery.surgery_date.substring(0, 7) : 'Undated';
    byMonth.set(m, [...(byMonth.get(m) || []), r]);
  });
  const summaryHeader = ['Month', 'Total', ...CATEGORY_COLUMNS, 'Performed', 'Assisted', 'Supervisor signature'];
  const summaryBody = Array.from(byMonth.entries()).map(([m, list]) => [
    m === 'Undated' ? m : formatMonth(m),
    list.length,
    ...CATEGORY_COLUMNS.map((c) => list.filter((r) => (r.surgery.procedure_category || 'Others') === c).length),
    list.filter((r) => r.surgery.role !== 'assisted_by_me').length,
    list.filter((r) => r.surgery.role === 'assisted_by_me').length,
    '',
  ]);
  const totalRow = ['Total', sorted.length, ...CATEGORY_COLUMNS.map((c) => sorted.filter((r) => (r.surgery.procedure_category || 'Others') === c).length),
    sorted.filter((r) => r.surgery.role !== 'assisted_by_me').length, sorted.filter((r) => r.surgery.role === 'assisted_by_me').length, ''];
  const summarySheet = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryBody, totalRow]);
  summarySheet['!cols'] = [12, 8, 8, 8, 8, 10, 8, 10, 10, 24].map((wch) => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, logSheet, 'Logbook');
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Monthly Summary');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/octet-stream' }), `surgical-logbook${anonymise ? '-anonymised' : ''}-${todayLocalDateStr()}.xlsx`);
}

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Hospital, Patient, Surgery } from './types';
import { formatDate, isHpeAwaiting, todayLocalDateStr } from './helpers';
import { formatMonth } from './fees';

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

function hpeText(h: HpeInfo | undefined): string {
  if (!h) return 'Not sent';
  if (isHpeAwaiting(h)) return `Awaiting${h.report_number ? ` (${h.report_number})` : ''}`;
  const report = (h.findings || '').replace(/\s+/g, ' ').trim();
  return [h.report_number, report || 'Report scanned'].filter(Boolean).join(' — ');
}

// Logbook in the usual university/board register layout: one numbered row
// per case in date order, plus a month-wise summary with a column left
// blank for the supervisor's signature.
export function exportLogbookExcel(rows: LogbookExportRow[], hpeByPatient: Map<string, HpeInfo>, meta: { doctorName: string; qualifications: string }) {
  const sorted = [...rows].sort((a, b) => (a.surgery.surgery_date || '').localeCompare(b.surgery.surgery_date || ''));

  const header = ['S.No', 'Date', 'Patient Name', 'Age/Sex', 'Case ID', 'Hospital', 'Diagnosis', 'Procedure', 'Type', 'Role', 'Anaesthesia', 'Outcome', 'HPE'];
  const body = sorted.map((r, i) => [
    i + 1,
    r.surgery.surgery_date ? formatDate(r.surgery.surgery_date) : '',
    r.patient?.patient_name || '',
    [r.patient?.age ?? '', sexShort(r.patient?.sex)].filter((v) => v !== '').join('/'),
    r.patient?.unique_id || '',
    r.hospital?.name || '',
    r.patient?.diagnosis || '',
    r.surgery.procedure_name || '',
    r.surgery.procedure_category || '',
    r.surgery.role === 'assisted_by_me' ? 'Assisted' : 'Performed',
    r.surgery.anaesthesia_type || '',
    r.surgery.outcome || '',
    hpeText(r.patient ? hpeByPatient.get(r.patient.id) : undefined),
  ]);
  const title = ['Surgical Logbook', [meta.doctorName.trim(), meta.qualifications.trim()].filter(Boolean).join(', ')];
  const logSheet = XLSX.utils.aoa_to_sheet([title, [], header, ...body]);
  logSheet['!cols'] = [6, 12, 22, 8, 12, 18, 26, 30, 10, 10, 12, 22, 30].map((wch) => ({ wch }));

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
  saveAs(new Blob([out], { type: 'application/octet-stream' }), `surgical-logbook-${todayLocalDateStr()}.xlsx`);
}

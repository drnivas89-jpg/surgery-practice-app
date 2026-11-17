import { saveAs } from 'file-saver';
import { supabase } from './supabase';
import { todayLocalDateStr } from './helpers';

// Every per-doctor table, in a sensible reading order. Images themselves
// stay in Supabase storage; their storage paths are included in the rows.
export const BACKUP_TABLES = [
  'hospitals', 'patients', 'surgeries', 'follow_ups', 'follow_up_visits', 'investigations', 'vitals',
  'payments', 'monthly_entries', 'revenue_transactions', 'attendance', 'gov_holidays',
  'classes', 'publications', 'surgery_types', 'consent_proformas',
] as const;

export const LAST_BACKUP_KEY = 'lastBackupDate';
const PAGE = 1000;
const EXCEL_CELL_LIMIT = 32000;

export type BackupData = Record<string, Record<string, unknown>[]>;

// Pages through each table (Supabase caps a single select at 1000 rows).
// A table that doesn't exist yet (migration not run) is skipped, not fatal.
export async function fetchAllData(onProgress?: (table: string) => void): Promise<BackupData> {
  const data: BackupData = {};
  for (const table of BACKUP_TABLES) {
    onProgress?.(table);
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data: page, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
      if (error || !page) break;
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    data[table] = rows;
  }
  return data;
}

const cellValue = (v: unknown): string | number | boolean | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > EXCEL_CELL_LIMIT ? `${s.substring(0, EXCEL_CELL_LIMIT)}… [truncated — see JSON backup]` : s;
};

// The Excel library is large, so it's only downloaded when a backup is made.
export async function downloadExcelBackup(data: BackupData) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const summary: (string | number)[][] = [['Surgery Practice backup', todayLocalDateStr()], [], ['Table', 'Rows']];
  for (const table of BACKUP_TABLES) summary.push([table, data[table]?.length || 0]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');
  for (const table of BACKUP_TABLES) {
    const rows = (data[table] || []).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cellValue(v)])));
    const sheet = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['(no rows)']]);
    XLSX.utils.book_append_sheet(wb, sheet, table.substring(0, 31));
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/octet-stream' }), `surgery-practice-backup-${todayLocalDateStr()}.xlsx`);
}

export function downloadJsonBackup(data: BackupData) {
  const payload = { app: 'surgery-practice', version: 1, exportedAt: new Date().toISOString(), tables: data };
  saveAs(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `surgery-practice-backup-${todayLocalDateStr()}.json`);
}

export function recordBackupDone() {
  try { localStorage.setItem(LAST_BACKUP_KEY, todayLocalDateStr()); } catch { /* storage unavailable */ }
}

export function lastBackupDate(): string | null {
  try { return localStorage.getItem(LAST_BACKUP_KEY); } catch { return null; }
}

import { supabase } from './supabase';

export const BIN_RETENTION_DAYS = 30;

// Parent tables before children, so a restore never inserts a row whose
// parent doesn't exist yet.
const RESTORE_ORDER = [
  'hospitals', 'patients', 'surgeries', 'follow_ups', 'follow_up_visits', 'investigations', 'vitals',
  'payments', 'monthly_entries', 'revenue_transactions', 'attendance', 'classes', 'gov_holidays', 'note_templates',
];

type Row = Record<string, unknown>;

export interface BinSnapshot {
  tables: Record<string, Row[]>;
}

export interface BinEntry {
  id: string;
  kind: string;
  label: string;
  snapshot: BinSnapshot;
  deleted_at: string;
}

// One piece of what is being deleted. `remove: false` parts are only
// snapshotted — the database deletes them itself (ON DELETE CASCADE).
export interface BinPart {
  table: string;
  match: Record<string, string>;
  remove?: boolean;
}

async function selectMatching(table: string, match: Record<string, string>) {
  let q = supabase.from(table).select('*');
  for (const [c, v] of Object.entries(match)) q = q.eq(c, v);
  return q;
}

async function deleteMatching(table: string, match: Record<string, string>) {
  let q = supabase.from(table).delete();
  for (const [c, v] of Object.entries(match)) q = q.eq(c, v);
  return q;
}

// Snapshot every part into the recycle bin, then delete. If the bin can't
// be written (e.g. its table isn't set up yet) nothing is deleted, so a
// record is never lost without a copy.
export async function moveToBin(kind: string, label: string, parts: BinPart[]): Promise<{ error: string | null }> {
  const tables: Record<string, Row[]> = {};
  for (const part of parts) {
    const { data, error } = await selectMatching(part.table, part.match);
    if (error) return { error: error.message };
    tables[part.table] = [...(tables[part.table] || []), ...((data || []) as Row[])];
  }
  if (Object.values(tables).every((rows) => rows.length === 0)) return { error: null };

  const { error: binError } = await supabase.from('recycle_bin').insert({ kind, label, snapshot: { tables } });
  if (binError) {
    return { error: binError.message.includes('recycle_bin') ? 'Recycle bin not set up yet — run the latest database update in Supabase first.' : binError.message };
  }
  for (const part of parts) {
    if (part.remove === false) continue;
    const { error } = await deleteMatching(part.table, part.match);
    if (error) return { error: error.message };
  }
  return { error: null };
}

export async function listBin(): Promise<BinEntry[]> {
  const { data } = await supabase.from('recycle_bin').select('*').order('deleted_at', { ascending: false });
  return (data || []) as BinEntry[];
}

// Puts every snapshotted row back (rows that still exist are left as-is),
// then removes the bin entry.
export async function restoreFromBin(entry: BinEntry): Promise<{ error: string | null }> {
  const order = [...RESTORE_ORDER, ...Object.keys(entry.snapshot.tables).filter((t) => !RESTORE_ORDER.includes(t))];
  for (const table of order) {
    const rows = entry.snapshot.tables[table];
    if (!rows?.length) continue;
    const cleaned = rows.map((r) => {
      // Joined objects (e.g. `hospital`) aren't columns.
      const copy: Row = {};
      Object.entries(r).forEach(([k, v]) => { if (v === null || typeof v !== 'object' || Array.isArray(v) || k === 'prescription_items' || k === 'snapshot' || k === 'settings') copy[k] = v; });
      return copy;
    });
    const { error } = await supabase.from(table).upsert(cleaned, { onConflict: 'id', ignoreDuplicates: true });
    if (error) return { error: `${table}: ${error.message}` };
  }
  await supabase.from('recycle_bin').delete().eq('id', entry.id);
  return { error: null };
}

export async function deleteForever(id: string) {
  await supabase.from('recycle_bin').delete().eq('id', id);
}

export async function purgeExpired() {
  const cutoff = new Date(Date.now() - BIN_RETENTION_DAYS * 86400000).toISOString();
  await supabase.from('recycle_bin').delete().lt('deleted_at', cutoff);
}

// Ready-made part lists for the app's delete actions.
export const binParts = {
  patient: (id: string): BinPart[] => [
    { table: 'patients', match: { id } },
    ...['surgeries', 'follow_ups', 'follow_up_visits', 'investigations', 'vitals', 'payments']
      .map((table) => ({ table, match: { patient_id: id }, remove: false })),
  ],
  row: (table: string, id: string): BinPart[] => [{ table, match: { id } }],
  day: (hospitalId: string, date: string): BinPart[] => [
    { table: 'monthly_entries', match: { hospital_id: hospitalId, entry_date: date } },
    { table: 'attendance', match: { hospital_id: hospitalId, attendance_date: date } },
  ],
};

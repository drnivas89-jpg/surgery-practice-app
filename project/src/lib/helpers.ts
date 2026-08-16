import { supabase } from './supabase';

export async function generateUniquePatientId(userId: string, hospitalId: string): Promise<string> {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();

  const prefix = `${month}/${year}`;
  const { data, error } = await supabase
    .from('patients')
    .select('unique_id')
    .eq('hospital_id', hospitalId)
    .like('unique_id', `%/${prefix}`)
    .order('unique_id', { ascending: false });

  if (error) {
    return `01/${prefix}`;
  }

  let nextNum = 1;
  if (data && data.length > 0) {
    const lastId = data[0].unique_id;
    const parts = lastId.split('/');
    const lastNum = parseInt(parts[0], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }

  return `${String(nextNum).padStart(2, '0')}/${prefix}`;
}

export async function upsertDailyEntryCount(
  userId: string,
  hospitalId: string,
  date: string,
  type: 'op' | 'ip' | 'opinion'
): Promise<void> {
  const monthKey = date.substring(0, 7) + '-01';
  const { data: existing } = await supabase
    .from('monthly_entries')
    .select('*')
    .eq('hospital_id', hospitalId)
    .eq('entry_date', date)
    .maybeSingle();

  if (existing) {
    const update: Record<string, number> = {};
    if (type === 'op') update.op_patients = (existing.op_patients || 0) + 1;
    else if (type === 'ip') update.ip_patients = (existing.ip_patients || 0) + 1;
    else update.opinion_patients = (existing.opinion_patients || 0) + 1;
    await supabase.from('monthly_entries').update(update).eq('id', existing.id);
  } else {
    const payload: Record<string, unknown> = {
      user_id: userId,
      hospital_id: hospitalId,
      entry_date: date,
      month: monthKey,
      op_patients: type === 'op' ? 1 : 0,
      ip_patients: type === 'ip' ? 1 : 0,
      opinion_patients: type === 'opinion' ? 1 : 0,
      fees_generated: 0,
      fees_received: 0,
      notes: '',
    };
    await supabase.from('monthly_entries').insert(payload);
  }
}

// Auto-marks the doctor Present at a hospital for a date, the first time
// any OP/IP/Opinion patient entry (or a manual daily entry) is recorded
// for that hospital+date. Idempotent — safe to call repeatedly; the second
// call just returns the existing row instead of creating a duplicate.
export async function ensurePresentAttendance(
  userId: string,
  hospitalId: string,
  date: string
): Promise<{ created: boolean; id: string | null }> {
  const { data: existing } = await supabase
    .from('attendance')
    .select('id')
    .eq('hospital_id', hospitalId)
    .eq('attendance_date', date)
    .eq('status', 'present')
    .maybeSingle();

  if (existing) return { created: false, id: existing.id };

  const { data: inserted, error } = await supabase
    .from('attendance')
    .insert({
      user_id: userId,
      hospital_id: hospitalId,
      attendance_date: date,
      status: 'present',
      duty_type: 'normal',
      notes: '',
    })
    .select('id')
    .maybeSingle();

  if (error) return { created: false, id: null };
  return { created: true, id: inserted?.id ?? null };
}

export async function uploadImage(
  file: File,
  userId: string,
  folder: string
): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from('surgery-images')
    .upload(fileName, file, { upsert: false });

  if (error) {
    console.error('Upload error:', error.message);
    return null;
  }
  return fileName;
}

export async function getImageUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('surgery-images').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

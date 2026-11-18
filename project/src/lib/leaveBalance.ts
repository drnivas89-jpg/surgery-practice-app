import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { classifyLeave, LeaveBreakdown } from './hospitalSummary';
import type { Attendance } from './types';

// Leave types that have a yearly entitlement. Week offs are a roster
// pattern and COL is its own earned balance, so neither has a quota.
export const QUOTA_KEYS: { key: keyof LeaveBreakdown; label: string }[] = [
  { key: 'cl', label: 'CL' },
  { key: 'medical', label: 'Medical' },
  { key: 'pdo', label: 'PDO' },
];

export type HospitalQuota = Partial<Record<keyof LeaveBreakdown, number>>;
/** hospital id -> yearly quota per leave type */
export type LeaveQuotas = Record<string, HospitalQuota>;

export interface BalanceRow { key: keyof LeaveBreakdown; label: string; quota: number; used: number; left: number }

/** Leave used vs quota for one hospital in a calendar year (Jan–Dec). */
export function leaveBalance(attendance: Pick<Attendance, 'hospital_id' | 'status' | 'attendance_date' | 'leave_type' | 'compensated_working_date'>[], hospitalId: string, year: number, quota: HospitalQuota | undefined): BalanceRow[] {
  const used: Partial<Record<keyof LeaveBreakdown, number>> = {};
  attendance
    .filter((a) => a.hospital_id === hospitalId && a.status === 'leave' && a.attendance_date.startsWith(String(year)))
    .forEach((a) => {
      const k = classifyLeave(a as Attendance);
      used[k] = (used[k] || 0) + 1;
    });
  return QUOTA_KEYS
    .filter(({ key }) => (quota?.[key] ?? 0) > 0)
    .map(({ key, label }) => {
      const q = quota![key]!;
      const u = used[key] || 0;
      return { key, label, quota: q, used: u, left: q - u };
    });
}

export interface UserSettings { leaveQuotas?: LeaveQuotas }

/**
 * Per-doctor settings stored in user_settings (one JSON row), so they follow
 * the doctor across devices. `available` is false until the 20261118
 * migration has been run.
 */
export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings>({});
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    supabase.from('user_settings').select('settings').maybeSingle().then(({ data, error }) => {
      if (error) { setAvailable(false); return; }
      setSettings((data?.settings as UserSettings) || {});
    });
  }, []);

  const save = useCallback(async (next: UserSettings) => {
    const { error } = await supabase.from('user_settings').upsert({ settings: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (!error) setSettings(next);
    return error?.message || null;
  }, []);

  return { settings, available, save };
}

import { supabase } from './supabase';
import { GovHoliday, Hospital } from './types';

export const SECOND_SATURDAY_NAME = 'Second Saturday';

// Everything COL accounting needs beyond attendance rows: which dates are
// government holidays, and which hospitals are government hospitals (any
// duty there on a holiday earns a COL credit automatically).
export interface ColContext {
  holidayNameOn: (date: string) => string | null;
  governmentHospitalIds: Set<string>;
}

export const EMPTY_COL_CONTEXT: ColContext = {
  holidayNameOn: () => null,
  governmentHospitalIds: new Set(),
};

function parseLocal(date: string): Date {
  const [y, m, d] = date.substring(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isSecondSaturday(date: string): boolean {
  const d = parseLocal(date);
  return d.getDay() === 6 && d.getDate() >= 8 && d.getDate() <= 14;
}

export function secondSaturdaysOfYear(year: number): string[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  return Array.from({ length: 12 }, (_, m) => {
    const firstDow = new Date(year, m, 1).getDay();
    const firstSat = 1 + ((6 - firstDow + 7) % 7);
    return `${year}-${pad(m + 1)}-${pad(firstSat + 7)}`;
  });
}

// A stored row always wins for its date: a named holiday (also overrides a
// second Saturday's name) or a cancellation. Otherwise second Saturdays
// are holidays by default.
export function buildHolidayLookup(holidays: GovHoliday[]): (date: string) => string | null {
  const byDate = new Map(holidays.map((h) => [h.holiday_date.substring(0, 10), h]));
  return (date: string) => {
    const row = byDate.get(date.substring(0, 10));
    if (row) return row.is_cancelled ? null : row.name.trim() || 'Government holiday';
    return isSecondSaturday(date) ? SECOND_SATURDAY_NAME : null;
  };
}

export function buildColContext(holidays: GovHoliday[], hospitals: Pick<Hospital, 'id' | 'is_government'>[]): ColContext {
  return {
    holidayNameOn: buildHolidayLookup(holidays),
    governmentHospitalIds: new Set(hospitals.filter((h) => h.is_government).map((h) => h.id)),
  };
}

// Tolerates the gov_holidays table not existing yet (migration not run):
// falls back to second Saturdays only instead of breaking the page.
export async function fetchGovHolidays(): Promise<GovHoliday[]> {
  const { data, error } = await supabase.from('gov_holidays').select('*').order('holiday_date');
  if (error) return [];
  return data || [];
}

export async function fetchColContext(hospitals?: Pick<Hospital, 'id' | 'is_government'>[]): Promise<ColContext> {
  const [holidays, hosp] = await Promise.all([
    fetchGovHolidays(),
    hospitals ? Promise.resolve(hospitals) : supabase.from('hospitals').select('*').then(({ data }) => (data || []) as Hospital[]),
  ]);
  return buildColContext(holidays, hosp);
}

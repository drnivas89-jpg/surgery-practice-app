import { ColCreditDate } from './col';
import { ColContext } from './holidays';
import { formatDate } from './helpers';
import { Patient } from './types';

export const COL_EXPIRY_WARNING_DAYS = 30;
export const HOLIDAY_LOOKAHEAD_DAYS = 7;
export const HPE_OVERDUE_DAYS = 21;
export const BACKUP_REMINDER_DAYS = 30;

export type AlertKind = 'col_expiring' | 'followup_overdue' | 'followup_today' | 'holiday' | 'hpe_awaiting' | 'backup';
export type AlertTone = 'rose' | 'amber' | 'sky';

export interface DashboardAlert {
  id: string;
  kind: AlertKind;
  tone: AlertTone;
  title: string;
  detail: string;
}

function parseLocal(date: string): Date {
  const [y, m, d] = date.substring(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseLocal(to).getTime() - parseLocal(from).getTime()) / 86400000);
}

function addDays(date: string, days: number): string {
  const d = parseLocal(date);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
const names = (list: Patient[]) => {
  const shown = list.slice(0, 3).map((p) => p.patient_name).join(', ');
  return list.length > 3 ? `${shown} +${list.length - 3} more` : shown;
};

export interface AlertSources {
  today: string; // yyyy-mm-dd
  availableCredits: ColCreditDate[];
  patients: Pick<Patient, 'patient_name' | 'follow_up_date'>[];
  colContext: ColContext;
  /** Cases whose HPE specimen was sent but no report is entered yet. */
  hpeAwaiting?: { patientName: string; surgeryDate: string | null }[];
  /** yyyy-mm-dd of the last backup taken on this device, or null. */
  lastBackup?: string | null;
}

// Computed fresh on every Dashboard load — nothing is stored, so alerts
// always reflect the current data and disappear once the cause is fixed.
export function buildDashboardAlerts({ today, availableCredits, patients, colContext, hpeAwaiting = [], lastBackup }: AlertSources): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  // COL credits about to be wasted, soonest first.
  const expiring = availableCredits
    .map((c) => ({ c, left: daysBetween(today, c.expiryDate) }))
    .filter(({ left }) => left >= 0 && left <= COL_EXPIRY_WARNING_DAYS)
    .sort((a, b) => a.left - b.left);
  if (expiring.length > 0) {
    const first = expiring[0];
    alerts.push({
      id: 'col_expiring',
      kind: 'col_expiring',
      tone: first.left <= 7 ? 'rose' : 'amber',
      title: `${plural(expiring.length, 'COL credit')} expiring soon`,
      detail: `${first.c.hospitalName} credit from ${formatDate(first.c.date)}${first.c.reason ? ` (${first.c.reason})` : ''} expires ${inDays(first.left)} — take COL leave before ${formatDate(first.c.expiryDate)}`
        + (expiring.length > 1 ? `; ${expiring.length - 1} more within ${COL_EXPIRY_WARNING_DAYS} days` : ''),
    });
  }

  const withFollowUp = patients.filter((p) => !!p.follow_up_date) as Patient[];
  const overdue = withFollowUp.filter((p) => p.follow_up_date!.substring(0, 10) < today);
  const dueToday = withFollowUp.filter((p) => p.follow_up_date!.substring(0, 10) === today);
  if (overdue.length > 0) {
    alerts.push({
      id: 'followup_overdue',
      kind: 'followup_overdue',
      tone: 'rose',
      title: `${plural(overdue.length, 'follow-up')} overdue`,
      detail: names(overdue),
    });
  }
  if (dueToday.length > 0) {
    alerts.push({
      id: 'followup_today',
      kind: 'followup_today',
      tone: 'amber',
      title: `${plural(dueToday.length, 'follow-up')} due today`,
      detail: names(dueToday),
    });
  }

  // Government holidays in the coming week — only meaningful when at
  // least one hospital is a government hospital.
  if (colContext.governmentHospitalIds.size > 0) {
    const upcoming: string[] = [];
    for (let i = 0; i <= HOLIDAY_LOOKAHEAD_DAYS; i++) {
      const d = addDays(today, i);
      const name = colContext.holidayNameOn(d);
      if (name) {
        const weekday = parseLocal(d).toLocaleDateString('en-GB', { weekday: 'short' });
        upcoming.push(`${name} — ${weekday} ${formatDate(d)} (${inDays(i)})`);
      }
    }
    if (upcoming.length > 0) {
      alerts.push({
        id: 'holiday',
        kind: 'holiday',
        tone: 'sky',
        title: upcoming.length === 1 ? 'Government holiday this week' : `${upcoming.length} government holidays this week`,
        detail: `${upcoming.join(' · ')}. Duty at a government hospital on a holiday earns COL automatically.`,
      });
    }
  }

  if (hpeAwaiting.length > 0) {
    const ages = hpeAwaiting.map((h) => (h.surgeryDate ? daysBetween(h.surgeryDate.substring(0, 10), today) : 0));
    const oldest = Math.max(...ages);
    const shown = hpeAwaiting.slice(0, 3).map((h) => h.patientName).join(', ');
    alerts.push({
      id: 'hpe_awaiting',
      kind: 'hpe_awaiting',
      tone: oldest > HPE_OVERDUE_DAYS ? 'rose' : 'amber',
      title: `${plural(hpeAwaiting.length, 'HPE report')} awaited`,
      detail: `${shown}${hpeAwaiting.length > 3 ? ` +${hpeAwaiting.length - 3} more` : ''}${oldest > 0 ? ` — oldest sent ${oldest} days ago` : ''}`,
    });
  }

  const backupAge = lastBackup ? daysBetween(lastBackup, today) : null;
  if (backupAge === null || backupAge >= BACKUP_REMINDER_DAYS) {
    alerts.push({
      id: 'backup',
      kind: 'backup',
      tone: 'sky',
      title: 'Time to back up your data',
      detail: backupAge === null ? 'No backup taken on this device yet — it takes one tap.' : `Last backup was ${backupAge} days ago.`,
    });
  }

  return alerts;
}

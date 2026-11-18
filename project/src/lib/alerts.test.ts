import { describe, expect, it } from 'vitest';
import { buildDashboardAlerts } from './alerts';
import { buildColContext } from './holidays';
import { colExpiryDate } from './col';

const credit = (date: string, reason: string) => ({
  date, hospitalId: 'n', hospitalName: 'NMCH', attendanceId: date, reason, expiryDate: colExpiryDate(date), source: 'holiday' as const,
});
const govCtx = buildColContext(
  [{ id: '1', user_id: 'u', holiday_date: '2026-11-19', name: 'Test Holiday', is_cancelled: false, created_at: '' }],
  [{ id: 'n', is_government: true }]
);
const today = '2026-11-17';

describe('dashboard alerts', () => {
  const alerts = buildDashboardAlerts({
    today,
    availableCredits: [credit('2026-05-20', 'Old'), credit('2026-06-13', 'Second Saturday'), credit('2026-10-10', 'Second Saturday')],
    patients: [
      { patient_name: 'A', follow_up_date: '2026-11-10' },
      { patient_name: 'B', follow_up_date: '2026-11-17' },
      { patient_name: 'C', follow_up_date: '2026-12-01' },
      { patient_name: 'D', follow_up_date: null },
    ],
    colContext: govCtx,
    hpeAwaiting: [{ patientName: 'E', surgeryDate: '2026-10-01' }],
    lastBackup: '2026-11-10',
  });

  it('raises the right alerts in order', () => {
    expect(alerts.map((a) => `${a.kind}/${a.tone}`)).toEqual([
      'col_expiring/rose', 'followup_overdue/rose', 'followup_today/amber', 'holiday/sky', 'hpe_awaiting/rose',
    ]);
  });

  it('describes them usefully', () => {
    expect(alerts[0].title).toBe('2 COL credits expiring soon');
    expect(alerts[0].detail.startsWith('NMCH credit from 20 May 2026 (Old) expires in 2 days')).toBe(true);
    expect(alerts[1].detail).toBe('A');
    expect(alerts[2].detail).toBe('B');
    expect(alerts[3].title).toBe('Government holiday this week');
    expect(alerts[4].detail).toBe('E — oldest sent 47 days ago');
  });

  it('asks for a 30-day grade only for recent ungraded cases', () => {
    const run = (surgeryDate: string) => buildDashboardAlerts({
      today, availableCredits: [], patients: [], colContext: govCtx, lastBackup: today,
      ungraded: [{ patientName: 'G', surgeryDate }],
    }).filter((a) => a.kind !== 'holiday').map((a) => a.kind);
    expect(run('2026-11-01')).toEqual([]); // 16 days: too early
    expect(run('2026-10-10')).toEqual(['grade_due']); // 38 days
    expect(run('2026-06-01')).toEqual([]); // older than the lookback
  });

  it('reminds about backups only when due', () => {
    const base = { today, availableCredits: [], patients: [], colContext: buildColContext([], []) };
    expect(buildDashboardAlerts({ ...base, lastBackup: '2026-11-01' })).toEqual([]);
    expect(buildDashboardAlerts({ ...base, lastBackup: null }).map((a) => a.kind)).toEqual(['backup']);
    expect(buildDashboardAlerts({ ...base, lastBackup: '2026-10-01' })[0].detail).toBe('Last backup was 47 days ago.');
  });
});

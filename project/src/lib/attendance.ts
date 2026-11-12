import { Attendance, LeaveTypeSlug } from './types';

// Status is only Duty or Leave. Duty has a kind; extra duty and COL duty
// are kinds of duty now, not separate statuses. The DB shape is unchanged
// (status 'present' | 'extra_duty' | 'leave'), so existing rows keep working.
export type AttendanceChoice = 'duty' | 'leave';
export type DutyKind = 'regular' | 'duty24' | 'extra' | 'col';

export interface AttendanceChoiceState {
  choice: AttendanceChoice;
  dutyKind: DutyKind;
  dutySubtype: string;
  extraDutyDetails: string;
  colReason: string;
  leaveType: LeaveTypeSlug | '';
  compensatedWorkingDate: string;
}

export const DUTY_KIND_OPTIONS: { value: DutyKind; label: string; hint: string }[] = [
  { value: 'regular', label: 'Regular', hint: 'Normal working day' },
  { value: 'duty24', label: '24 Hrs Duty', hint: 'Round-the-clock duty' },
  { value: 'extra', label: 'Extra Duty', hint: 'Extra shift, no COL' },
  { value: 'col', label: 'COL', hint: 'Earns 1 COL credit' },
];

export const LEAVE_TYPE_OPTIONS: { value: LeaveTypeSlug; label: string }[] = [
  { value: 'casual', label: 'Casual' },
  { value: 'week_off', label: 'Week Off' },
  { value: 'medical', label: 'Medical' },
  { value: 'pdo', label: 'PDO' },
  { value: 'col', label: 'COL' },
];

export function defaultAttendanceChoiceState(): AttendanceChoiceState {
  return {
    choice: 'duty',
    dutyKind: 'regular',
    dutySubtype: '',
    extraDutyDetails: '',
    colReason: '',
    leaveType: '',
    compensatedWorkingDate: '',
  };
}

// Reverse mapping — builds the picker's initial state from an existing
// Attendance row for edit flows. Legacy free-text extra_duty_type values
// (anything but 'col'/'extra') are kept as the extra duty details.
export function attendanceToChoiceState(a: Attendance | null): AttendanceChoiceState {
  const base = defaultAttendanceChoiceState();
  if (!a) return base;

  if (a.status === 'present') {
    if (a.duty_type === 'duty') return { ...base, dutyKind: 'duty24', dutySubtype: a.duty_subtype || '' };
    return base;
  }

  if (a.status === 'extra_duty') {
    const raw = (a.extra_duty_type || '').trim();
    if (raw.toLowerCase() === 'col') return { ...base, dutyKind: 'col', colReason: a.col_reason || '' };
    return { ...base, dutyKind: 'extra', extraDutyDetails: raw.toLowerCase() === 'extra' ? '' : raw };
  }

  const slugs: LeaveTypeSlug[] = ['casual', 'week_off', 'medical', 'pdo', 'col'];
  const leaveType = (slugs as string[]).includes(a.leave_type || '') ? (a.leave_type as LeaveTypeSlug) : '';
  return {
    ...base,
    choice: 'leave',
    leaveType: a.compensated_working_date ? 'col' : leaveType,
    compensatedWorkingDate: a.compensated_working_date || '',
  };
}

export function validateAttendanceChoice(state: AttendanceChoiceState): string | null {
  if (state.choice === 'leave' && !state.leaveType) {
    return 'Please select a type of leave.';
  }
  if (state.choice === 'leave' && state.leaveType === 'col' && !state.compensatedWorkingDate) {
    return 'Please select which COL credit this leave uses.';
  }
  return null;
}

type AttendanceFields = Pick<
  Attendance,
  'status' | 'duty_type' | 'duty_subtype' | 'leave_type' | 'extra_duty_type' | 'compensated_working_date' | 'col_reason'
>;

const EMPTY_FIELDS: AttendanceFields = {
  status: 'present',
  duty_type: null,
  duty_subtype: null,
  leave_type: null,
  extra_duty_type: null,
  compensated_working_date: null,
  col_reason: null,
};

// Single source of truth for turning a picker choice into attendance row
// fields — every entry point calls this, so they can never disagree.
export function buildAttendanceFields(state: AttendanceChoiceState): AttendanceFields {
  if (state.choice === 'leave') {
    return {
      ...EMPTY_FIELDS,
      status: 'leave',
      leave_type: state.leaveType || null,
      compensated_working_date: state.leaveType === 'col' ? state.compensatedWorkingDate : null,
    };
  }
  switch (state.dutyKind) {
    case 'regular':
      return { ...EMPTY_FIELDS, status: 'present', duty_type: 'normal' };
    case 'duty24':
      return { ...EMPTY_FIELDS, status: 'present', duty_type: 'duty', duty_subtype: state.dutySubtype.trim() || null };
    case 'extra': {
      // Details are free text, but must never read as the 'col' slug.
      const details = state.extraDutyDetails.trim();
      return { ...EMPTY_FIELDS, status: 'extra_duty', extra_duty_type: details && details.toLowerCase() !== 'col' ? details : 'extra' };
    }
    case 'col':
      return { ...EMPTY_FIELDS, status: 'extra_duty', extra_duty_type: 'col', col_reason: state.colReason.trim() || null };
  }
}

// Human label for a saved attendance row's duty kind / leave.
export function dutyKindOf(a: Attendance): DutyKind | null {
  if (a.status === 'leave') return null;
  if (a.status === 'present') return a.duty_type === 'duty' ? 'duty24' : 'regular';
  return (a.extra_duty_type || '').toLowerCase() === 'col' ? 'col' : 'extra';
}

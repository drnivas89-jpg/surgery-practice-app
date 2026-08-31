import { Attendance, LeaveTypeSlug } from './types';

export type AttendanceChoice = 'duty' | 'duty24' | 'extra_duty' | 'leave';
export type ExtraDutyKind = 'col' | 'extra' | 'others';

export interface AttendanceChoiceState {
  choice: AttendanceChoice;
  dutySubtype: string;
  extraDutyKind: ExtraDutyKind;
  extraDutyOthersText: string;
  leaveType: LeaveTypeSlug | '';
  compensatedWorkingDate: string;
}

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
    dutySubtype: '',
    extraDutyKind: 'col',
    extraDutyOthersText: '',
    leaveType: '',
    compensatedWorkingDate: '',
  };
}

// Reverse mapping — builds the picker's initial state from an existing
// Attendance row, so edit flows (EditDayModal, PresentDutyPrompt) can
// pre-populate it. Legacy extra_duty_type free text that isn't 'col' or
// 'extra' is treated as 'others' with the stored text preserved.
export function attendanceToChoiceState(a: Attendance | null): AttendanceChoiceState {
  const base = defaultAttendanceChoiceState();
  if (!a) return base;

  if (a.status === 'present') {
    if (a.duty_type === 'duty') {
      return { ...base, choice: 'duty24', dutySubtype: a.duty_subtype || '' };
    }
    return { ...base, choice: 'duty' };
  }

  if (a.status === 'extra_duty') {
    const raw = (a.extra_duty_type || '').toLowerCase();
    if (raw === 'col') return { ...base, choice: 'extra_duty', extraDutyKind: 'col' };
    if (raw === 'extra') return { ...base, choice: 'extra_duty', extraDutyKind: 'extra' };
    return { ...base, choice: 'extra_duty', extraDutyKind: 'others', extraDutyOthersText: a.extra_duty_type || '' };
  }

  // status === 'leave'
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
  if (state.choice === 'extra_duty' && state.extraDutyKind === 'others' && !state.extraDutyOthersText.trim()) {
    return 'Please enter the extra duty type.';
  }
  if (state.choice === 'leave' && !state.leaveType) {
    return 'Please select a type of leave.';
  }
  if (state.choice === 'leave' && state.leaveType === 'col' && !state.compensatedWorkingDate) {
    return 'Please select which COL credit date this leave redeems.';
  }
  return null;
}

// Single source of truth for turning a picker choice into attendance row
// fields — every entry point (Hospitals.tsx modal, EditDayModal,
// PresentDutyPrompt, ColMonthCalendar) calls this instead of re-deriving
// the mapping itself, so they can never disagree on the DB shape.
export function buildAttendanceFields(state: AttendanceChoiceState): Pick<
  Attendance,
  'status' | 'duty_type' | 'duty_subtype' | 'leave_type' | 'extra_duty_type' | 'compensated_working_date'
> {
  switch (state.choice) {
    case 'duty':
      return {
        status: 'present',
        duty_type: 'normal',
        duty_subtype: null,
        leave_type: null,
        extra_duty_type: null,
        compensated_working_date: null,
      };
    case 'duty24':
      return {
        status: 'present',
        duty_type: 'duty',
        duty_subtype: state.dutySubtype.trim() || null,
        leave_type: null,
        extra_duty_type: null,
        compensated_working_date: null,
      };
    case 'extra_duty': {
      const extra_duty_type = state.extraDutyKind === 'others' ? state.extraDutyOthersText.trim() : state.extraDutyKind;
      return {
        status: 'extra_duty',
        duty_type: null,
        duty_subtype: null,
        leave_type: null,
        extra_duty_type,
        compensated_working_date: null,
      };
    }
    case 'leave':
      return {
        status: 'leave',
        duty_type: null,
        duty_subtype: null,
        leave_type: state.leaveType || null,
        extra_duty_type: null,
        compensated_working_date: state.leaveType === 'col' ? state.compensatedWorkingDate : null,
      };
  }
}

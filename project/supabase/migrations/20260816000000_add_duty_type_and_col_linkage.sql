/*
# Add duty_type and a real COL redemption link to attendance

## Purpose
1. `duty_type` lets a "present" attendance row be tagged 'normal' or 'duty'
   (a distinct duty shift), without touching the existing `status` enum
   ('present' | 'leave' | 'extra_duty') that Extra Duty / COL already rely on.
2. `compensated_working_date` lets a `leave` row explicitly record which
   COL-earned date (an existing `extra_duty` + `extra_duty_type='col'` row)
   it redeems, replacing the app's previous behaviour of *guessing* this
   pairing at render time from scratch on every page load.
3. A partial unique index prevents the same COL-earned date from ever being
   redeemed by two different leave rows for the same user.

Both new columns are nullable and additive — no existing data is touched,
no existing column is altered or dropped.
*/

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS duty_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS compensated_working_date date DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_col_redemption
  ON attendance (user_id, compensated_working_date)
  WHERE compensated_working_date IS NOT NULL;

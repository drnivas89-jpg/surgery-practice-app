/*
# De-duplicate attendance and enforce the constraint the original migration promised

## Background
The migration that created `attendance` (20260804013636) documented a plan
to add "a unique constraint on (hospital_id, attendance_date, status,
leave_type, extra_duty_type) to avoid exact duplicates" — but the constraint
was never actually added, only a plain non-unique index. This migration
finally adds it, so the same attendance entry can no longer be submitted
twice for the same hospital/date/status (this is also what makes the new
auto-attendance-on-patient-entry feature safe to call repeatedly).

## Before running this
If you want to see how many duplicate rows exist first, run this as a
separate, standalone check (safe, read-only):

  SELECT hospital_id, attendance_date, status,
         COALESCE(leave_type,''), COALESCE(extra_duty_type,''), COUNT(*)
  FROM attendance
  GROUP BY 1,2,3,4,5
  HAVING COUNT(*) > 1;

## What this migration does
1. For any exact-duplicate group, keeps only the oldest row (by id) and
   deletes the rest.
2. Adds the unique index so duplicates can't be re-created going forward.

Leave / extra_duty rows with different leave_type / extra_duty_type values
on the same hospital+date are NOT considered duplicates and are left alone
(status alone doesn't collapse them — only truly identical rows are removed).
*/

DELETE FROM attendance a USING attendance b
WHERE a.id > b.id
  AND a.hospital_id = b.hospital_id
  AND a.attendance_date = b.attendance_date
  AND a.status = b.status
  AND COALESCE(a.leave_type, '') = COALESCE(b.leave_type, '')
  AND COALESCE(a.extra_duty_type, '') = COALESCE(b.extra_duty_type, '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_no_exact_dupes
  ON attendance (hospital_id, attendance_date, status, COALESCE(leave_type, ''), COALESCE(extra_duty_type, ''));

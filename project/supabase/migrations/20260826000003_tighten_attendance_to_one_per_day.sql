/*
# Tighten attendance to one record per (doctor, hospital, date)

## Background
20260816000001 added a unique index on
(hospital_id, attendance_date, status, leave_type, extra_duty_type) —
which stops *exact* duplicates but still allows several different-status
rows for the same hospital on the same day (e.g. an auto-created "present"
row from logging an OP visit, plus a separately-added "leave" row for that
same day). The app's attendance model is meant to represent one day's
status per hospital, so this migration enforces that properly: at most one
attendance row per (doctor_id, hospital_id, date).

## What this migration does
1. For any hospital+date with more than one row for the same doctor, keeps
   exactly one — preferring the most specific/intentional entry (an
   explicit leave, then extra duty, then a marked "duty" day, then a plain
   auto-marked "present") and, among equal priority, the most recently
   created row — and deletes the rest.
2. Replaces the old finer-grained unique index with a single unique index
   on (user_id, hospital_id, attendance_date).

Application code (Hospitals.tsx `handleSaveAttendance`) is updated
alongside this migration to upsert on this same key instead of blind
inserting, so saving attendance for a hospital+date that already has a
row updates it in place rather than conflicting.
*/

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, hospital_id, attendance_date
      ORDER BY
        CASE
          WHEN status = 'leave' THEN 0
          WHEN status = 'extra_duty' THEN 1
          WHEN status = 'present' AND duty_type = 'duty' THEN 2
          ELSE 3
        END ASC,
        created_at DESC
    ) AS rn
  FROM attendance
)
DELETE FROM attendance a
USING ranked r
WHERE a.id = r.id AND r.rn > 1;

DROP INDEX IF EXISTS idx_attendance_no_exact_dupes;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_one_per_doctor_hospital_day
  ON attendance (user_id, hospital_id, attendance_date);

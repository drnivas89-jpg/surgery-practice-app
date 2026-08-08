/*
# Fix attendance table security/insert error

## Problem
The `attendance` table's `user_id` column was created as `NOT NULL` but,
unlike every other table in this schema (hospitals, patients, surgeries,
follow_ups, payments), it was never given `DEFAULT auth.uid()`.

The app's "Add Attendance" form inserts a row without explicitly setting
`user_id` (matching the pattern used for every other table, which relies
on the database default). Because `attendance.user_id` had no default,
every attendance insert left `user_id` as NULL, which then failed the
`insert_own_attendance` row-level-security policy
(`WITH CHECK (auth.uid() = user_id)`) — surfacing as a security/RLS
policy error to the user instead of saving the entry.

## Fix
Add `DEFAULT auth.uid()` to `attendance.user_id`, matching every other
table. No data loss; purely additive.
*/

ALTER TABLE attendance
  ALTER COLUMN user_id SET DEFAULT auth.uid();

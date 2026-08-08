/*
# Add mobile number, discharge date, and attendance tracking

1. Purpose
   - Patients get an optional mobile number and (for IP patients) a discharge date.
   - A new `attendance` table tracks daily attendance per hospital:
     present, leave (with a free-text leave type), or extra duty
     (extra / col / others — free-text type).

2. New columns on `patients`
   - `mobile_number` (text, nullable)
   - `discharge_date` (date, nullable) — for IP patients

3. New table `attendance`
   - One row per hospital per date per status entry.
   - `status` is 'present' | 'leave' | 'extra_duty'
   - `leave_type` text (nullable) — free text, e.g. "Casual", "Sick", "Earned"
   - `extra_duty_type` text (nullable) — free text, e.g. "extra", "col", "others"
   - Unique constraint on (hospital_id, attendance_date, status, leave_type, extra_duty_type)
     to avoid exact duplicates.

4. Security
   - RLS enabled on `attendance`; 4 policies (CRUD) scoped to authenticated owner.
   - All columns additive; no data loss.
*/

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS mobile_number text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS discharge_date date DEFAULT NULL;

CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'leave', 'extra_duty')),
  leave_type text DEFAULT NULL,
  extra_duty_type text DEFAULT NULL,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_attendance" ON attendance FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_attendance" ON attendance FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_attendance" ON attendance FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_attendance" ON attendance FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_attendance_hospital_date
  ON attendance (hospital_id, attendance_date);

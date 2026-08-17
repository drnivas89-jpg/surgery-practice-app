/*
# Add vitals table

## Purpose
A repeatable, optional, dated log of vitals readings (BP, pulse,
temperature, SpO2, respiratory rate) per patient — shown on the new
Basic Details tab of Patient Details. Never required; a patient can have
zero vitals rows.

## Security
RLS enabled, 4 owner-scoped policies, same shape as `attendance`
(see 20260804013636_add_mobile_discharge_attendance.sql).
*/

CREATE TABLE IF NOT EXISTS vitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  recorded_at date NOT NULL DEFAULT CURRENT_DATE,
  bp_systolic integer,
  bp_diastolic integer,
  pulse integer,
  temperature numeric,
  spo2 integer,
  respiratory_rate integer,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_vitals" ON vitals FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_vitals" ON vitals FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_vitals" ON vitals FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_vitals" ON vitals FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_vitals_patient ON vitals (patient_id);

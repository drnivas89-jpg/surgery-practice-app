/*
# Add follow_up_visits table

## Purpose
A dated history of follow-up consultation visits per patient — distinct
from the existing `follow_ups` table (which is specifically FNAC/biopsy
pathology reports). Each visit captures free-text clinical notes/recovery
observations plus its own dynamic prescription table (same JSONB shape as
`patients.prescription_items`), so a patient's Patient Details "Follow-ups"
tab can show a full history of consultation notes and repeat prescriptions
over time, not just the single "current" prescription on the patient row.

## New Tables
### follow_up_visits
- id (uuid, PK)
- user_id (uuid, owner, defaults to auth.uid())
- patient_id (uuid, FK -> patients)
- visit_date (date, defaults to today)
- notes (text, clinical notes / recovery progress / observations)
- prescription_items (jsonb, same {columns, rows} shape as patients.prescription_items)
- created_at (timestamptz)

## Security
RLS enabled, 4 owner-scoped policies, same shape as `vitals`
(see 20260817000000_add_vitals.sql).
*/

CREATE TABLE IF NOT EXISTS follow_up_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text DEFAULT '',
  prescription_items jsonb NOT NULL DEFAULT '{"columns":[{"key":"drug_name","label":"Drug Name"},{"key":"dose","label":"Dose"},{"key":"frequency","label":"Dosage / Frequency"},{"key":"days","label":"No. of Days"},{"key":"instructions","label":"Instructions"}],"rows":[]}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE follow_up_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_follow_up_visits" ON follow_up_visits FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_follow_up_visits" ON follow_up_visits FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_follow_up_visits" ON follow_up_visits FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_follow_up_visits" ON follow_up_visits FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_follow_up_visits_patient ON follow_up_visits (patient_id);

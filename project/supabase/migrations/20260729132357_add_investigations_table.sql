/*
# Add investigations table for custom patient investigation reports

## Overview
Adds a new table to store custom investigation reports per patient.
The surgeon can type any investigation name (e.g. "Hemoglobin", "Blood Sugar",
"Creatinine", "Ultrasound", etc.), enter the date and value/result.

## New Tables
### investigations
- id (uuid, PK)
- user_id (uuid, surgeon owner, defaults to auth.uid())
- patient_id (uuid, FK -> patients)
- investigation_name (text, e.g. "Hemoglobin", "Blood Sugar")
- investigation_date (date, when the test was done)
- value (text, the result/value — stored as text to support both numeric and text results)
- notes (text, optional)
- created_at (timestamptz)

## Security
- RLS enabled with owner-scoped CRUD (4 policies, one per verb).
*/

CREATE TABLE IF NOT EXISTS investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  investigation_name text NOT NULL DEFAULT '',
  investigation_date date,
  value text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE investigations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_investigations" ON investigations;
CREATE POLICY "select_own_investigations" ON investigations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_investigations" ON investigations;
CREATE POLICY "insert_own_investigations" ON investigations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_investigations" ON investigations;
CREATE POLICY "update_own_investigations" ON investigations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_investigations" ON investigations;
CREATE POLICY "delete_own_investigations" ON investigations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_investigations_patient_id ON investigations(patient_id);
CREATE INDEX IF NOT EXISTS idx_investigations_user_id ON investigations(user_id);

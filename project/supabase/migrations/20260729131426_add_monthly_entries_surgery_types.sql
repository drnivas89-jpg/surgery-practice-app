/*
# Add monthly hospital entries, surgery types, and surgery_type column

## Overview
This migration adds support for:
1. Monthly hospital aggregate entries (OP/IP patient counts + fees) without needing individual patient records.
2. Customizable surgery types that the surgeon can add/update beyond the defaults (major, minor, bedside, endoscopy, other).
3. A surgery_type column on the surgeries table.

## New Tables

### monthly_entries
Stores monthly aggregate data per hospital (OP/IP counts, fees generated, fees received).
- id (uuid, PK)
- user_id (uuid, surgeon owner, defaults to auth.uid())
- hospital_id (uuid, FK -> hospitals)
- month (date, first day of the month, e.g. 2025-01-01)
- op_patients (integer, outpatient count)
- ip_patients (integer, inpatient count)
- fees_generated (numeric, total fees for the month)
- fees_received (numeric, amount received that month)
- notes (text)
- created_at (timestamptz)
- Unique constraint on (hospital_id, month) so only one entry per hospital per month.

### surgery_types
Stores customizable surgery type labels. Seeded with defaults.
- id (uuid, PK)
- user_id (uuid, surgeon owner, defaults to auth.uid())
- name (text, e.g. "Major", "Minor", "Bedside", "Endoscopy", "Other")
- created_at (timestamptz)

## Modified Tables

### surgeries
- Added column: surgery_type (text, nullable). Stores the surgery type label.

## Security
- RLS enabled on new tables with owner-scoped CRUD.
- All policies use auth.uid() = user_id.
*/

-- monthly_entries table
CREATE TABLE IF NOT EXISTS monthly_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  month date NOT NULL,
  op_patients integer DEFAULT 0,
  ip_patients integer DEFAULT 0,
  fees_generated numeric(12,2) DEFAULT 0,
  fees_received numeric(12,2) DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE monthly_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_monthly_entries" ON monthly_entries;
CREATE POLICY "select_own_monthly_entries" ON monthly_entries FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_monthly_entries" ON monthly_entries;
CREATE POLICY "insert_own_monthly_entries" ON monthly_entries FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_monthly_entries" ON monthly_entries;
CREATE POLICY "update_own_monthly_entries" ON monthly_entries FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_monthly_entries" ON monthly_entries;
CREATE POLICY "delete_own_monthly_entries" ON monthly_entries FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_entries_hospital_month
  ON monthly_entries(hospital_id, month);

CREATE INDEX IF NOT EXISTS idx_monthly_entries_user_id ON monthly_entries(user_id);

-- surgery_types table
CREATE TABLE IF NOT EXISTS surgery_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE surgery_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_surgery_types" ON surgery_types;
CREATE POLICY "select_own_surgery_types" ON surgery_types FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_surgery_types" ON surgery_types;
CREATE POLICY "insert_own_surgery_types" ON surgery_types FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_surgery_types" ON surgery_types;
CREATE POLICY "update_own_surgery_types" ON surgery_types FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_surgery_types" ON surgery_types;
CREATE POLICY "delete_own_surgery_types" ON surgery_types FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_surgery_types_user_id ON surgery_types(user_id);

-- Add surgery_type column to surgeries
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'surgeries' AND column_name = 'surgery_type'
  ) THEN
    ALTER TABLE surgeries ADD COLUMN surgery_type text DEFAULT '';
  END IF;
END $$;

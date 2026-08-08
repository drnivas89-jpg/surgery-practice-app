/*
# Surgery Practice Management Schema

## Overview
Multi-tenant schema for a surgical practice management app. Each surgeon signs in
with their own account and sees only their own data.

## New Tables

### hospitals
Stores the hospitals a surgeon operates at.
- id (uuid, PK)
- user_id (uuid, surgeon owner, defaults to auth.uid())
- name (text, hospital name)
- created_at (timestamptz)

### patients
Stores patient records.
- id (uuid, PK)
- user_id (uuid, surgeon owner)
- hospital_id (uuid, FK -> hospitals)
- unique_id (text, format NN/MM/YYYY sequential per surgeon per month)
- patient_name (text)
- age (integer)
- sex (text: male/female/other)
- fees (numeric, surgical/professional fees)
- prescription (text)
- admission_date (date)
- follow_up_date (date)
- surgery_date (date)
- created_at (timestamptz)

### surgeries
Surgery details for a patient.
- id (uuid, PK)
- patient_id (uuid, FK -> patients)
- user_id (uuid, surgeon owner)
- procedure_name (text)
- anaesthesia_type (text)
- procedure_notes (text)
- surgery_date (date)
- image_paths (text[], array of storage paths for surgery images)
- created_at (timestamptz)

### follow_ups
Follow-up / pathology entries (FNAC or biopsy).
- id (uuid, PK)
- patient_id (uuid, FK -> patients)
- user_id (uuid, surgeon owner)
- type (text: fnac / biopsy)
- report_number (text, FNAC or HPE number)
- lab (text)
- year (integer)
- findings (text)
- report_image_paths (text[], storage paths for report images)
- created_at (timestamptz)

### payments
Payment records for patients (revenue tracking).
- id (uuid, PK)
- patient_id (uuid, FK -> patients)
- user_id (uuid, surgeon owner)
- hospital_id (uuid, FK -> hospitals)
- amount (numeric, amount received)
- payment_date (date)
- notes (text)
- created_at (timestamptz)

## Security
- RLS enabled on every table.
- Owner-scoped CRUD: each authenticated surgeon can only access rows they own
  (user_id = auth.uid()). Child tables scope through their parent's ownership.
- Storage bucket "surgery-images" created as private bucket for surgery + report images.
*/

-- Hospitals
CREATE TABLE IF NOT EXISTS hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_hospitals" ON hospitals;
CREATE POLICY "select_own_hospitals" ON hospitals FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_hospitals" ON hospitals;
CREATE POLICY "insert_own_hospitals" ON hospitals FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_hospitals" ON hospitals;
CREATE POLICY "update_own_hospitals" ON hospitals FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_hospitals" ON hospitals;
CREATE POLICY "delete_own_hospitals" ON hospitals FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Patients
CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  unique_id text NOT NULL,
  patient_name text NOT NULL,
  age integer,
  sex text CHECK (sex IN ('male','female','other')),
  fees numeric(12,2) DEFAULT 0,
  prescription text DEFAULT '',
  admission_date date,
  follow_up_date date,
  surgery_date date,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_patients" ON patients;
CREATE POLICY "select_own_patients" ON patients FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_patients" ON patients;
CREATE POLICY "insert_own_patients" ON patients FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_patients" ON patients;
CREATE POLICY "update_own_patients" ON patients FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_patients" ON patients;
CREATE POLICY "delete_own_patients" ON patients FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Surgeries
CREATE TABLE IF NOT EXISTS surgeries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  procedure_name text NOT NULL DEFAULT '',
  anaesthesia_type text DEFAULT '',
  procedure_notes text DEFAULT '',
  surgery_date date,
  image_paths text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE surgeries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_surgeries" ON surgeries;
CREATE POLICY "select_own_surgeries" ON surgeries FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_surgeries" ON surgeries;
CREATE POLICY "insert_own_surgeries" ON surgeries FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_surgeries" ON surgeries;
CREATE POLICY "update_own_surgeries" ON surgeries FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_surgeries" ON surgeries;
CREATE POLICY "delete_own_surgeries" ON surgeries FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Follow-ups
CREATE TABLE IF NOT EXISTS follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text CHECK (type IN ('fnac','biopsy')),
  report_number text DEFAULT '',
  lab text DEFAULT '',
  year integer,
  findings text DEFAULT '',
  report_image_paths text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_follow_ups" ON follow_ups;
CREATE POLICY "select_own_follow_ups" ON follow_ups FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_follow_ups" ON follow_ups;
CREATE POLICY "insert_own_follow_ups" ON follow_ups FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_follow_ups" ON follow_ups;
CREATE POLICY "update_own_follow_ups" ON follow_ups FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_follow_ups" ON follow_ups;
CREATE POLICY "delete_own_follow_ups" ON follow_ups FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_date date NOT NULL,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_payments" ON payments;
CREATE POLICY "select_own_payments" ON payments FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_payments" ON payments;
CREATE POLICY "insert_own_payments" ON payments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_payments" ON payments;
CREATE POLICY "update_own_payments" ON payments FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_payments" ON payments;
CREATE POLICY "delete_own_payments" ON payments FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);
CREATE INDEX IF NOT EXISTS idx_patients_hospital_id ON patients(hospital_id);
CREATE INDEX IF NOT EXISTS idx_surgeries_patient_id ON surgeries(patient_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_patient_id ON follow_ups(patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_hospital_id ON payments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient_id ON payments(patient_id);

-- Storage bucket for surgery and report images
INSERT INTO storage.buckets (id, name, public)
VALUES ('surgery-images', 'surgery-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users manage only their own folder
DROP POLICY IF EXISTS "select_own_surgery_images" ON storage.objects;
CREATE POLICY "select_own_surgery_images" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'surgery-images' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "insert_own_surgery_images" ON storage.objects;
CREATE POLICY "insert_own_surgery_images" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'surgery-images' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "update_own_surgery_images" ON storage.objects;
CREATE POLICY "update_own_surgery_images" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'surgery-images' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'surgery-images' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "delete_own_surgery_images" ON storage.objects;
CREATE POLICY "delete_own_surgery_images" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'surgery-images' AND auth.uid()::text = (storage.foldername(name))[1]);

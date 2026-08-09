/*
# Support fields for the guided patient registration flow

## Purpose
The patient registration flow is being restructured into a guided,
step-by-step wizard (demographics -> diagnosis -> OP/IP -> branching
detail steps -> fees). A few new fields are needed on `patients` to
support the IP branch (surgical vs non-surgical treatment, discharge
advice, an uploaded discharge summary, and optional treatment photos
for non-surgical patients).

## New columns on patients
- treatment_type: 'surgical' | 'non_surgical', only meaningful for IP
  patients — records which branch of the wizard was used.
- discharge_advice: free-text discharge instructions.
- discharge_summary_path: storage path to an uploaded discharge
  summary file (image or PDF), same storage bucket/pattern as other
  uploads in this app.
- treatment_photo_paths: array of storage paths for optional photos
  taken during non-surgical treatment.

All additive, all nullable/defaulted — no impact on existing rows.
*/

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS treatment_type text,
  ADD COLUMN IF NOT EXISTS discharge_advice text DEFAULT '',
  ADD COLUMN IF NOT EXISTS discharge_summary_path text,
  ADD COLUMN IF NOT EXISTS treatment_photo_paths text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patients_treatment_type_check'
  ) THEN
    ALTER TABLE patients
      ADD CONSTRAINT patients_treatment_type_check
      CHECK (treatment_type IS NULL OR treatment_type IN ('surgical', 'non_surgical'));
  END IF;
END $$;

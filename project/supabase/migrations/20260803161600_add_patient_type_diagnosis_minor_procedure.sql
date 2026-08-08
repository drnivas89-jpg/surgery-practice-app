/*
# Add patient type, diagnosis, and minor procedure fields to patients

1. Purpose
   Patients are now classified as OP (outpatient) or IP (inpatient) after demographic
   entry. OP patients get diagnosis, prescription, a flag for whether a minor procedure
   was done, and optional follow-up. IP patients keep the existing admission/surgery flow.

2. New Columns on `patients`
   - `patient_type` (text, nullable) — 'op' or 'ip'. Nullable so existing rows are not broken.
   - `diagnosis` (text, nullable) — clinical diagnosis for OP patients.
   - `minor_procedure_done` (boolean, default false) — whether a minor procedure was performed.

3. Security
   No new tables. RLS already enabled on `patients`; existing policies cover the new
   columns automatically.

4. Notes
   - All three columns are additive; no data loss.
   - `follow_up_date` already exists on patients for OP follow-up reminders.
*/

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS patient_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS diagnosis text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS minor_procedure_done boolean DEFAULT false;

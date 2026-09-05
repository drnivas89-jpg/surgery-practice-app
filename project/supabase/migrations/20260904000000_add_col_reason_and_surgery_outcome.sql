/*
  # Add col_reason to attendance and outcome to surgeries

  ## col_reason
  Free-text "Reason / Occasion" captured when a COL credit is earned
  (Extra Duty -> COL), e.g. "Republic Day Duty Compensation",
  "Emergency On-Call Compensated". Nullable, optional — not every credit
  needs a stated occasion, and existing rows have none.

  ## outcome
  Free-text clinical outcome for a surgery/procedure (e.g. "Uneventful
  recovery", "Wound infection", "Readmitted"), entered per-case so it
  works for OP/Opinion day-care procedures too, not just IP patients
  (who are the only ones with a discharge_advice field today). Nullable,
  optional.
*/

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS col_reason text DEFAULT NULL;

ALTER TABLE surgeries
  ADD COLUMN IF NOT EXISTS outcome text DEFAULT NULL;

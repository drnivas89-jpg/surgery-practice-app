/*
# Add procedure_category and implants to surgeries

## Purpose
1. `procedure_category` is an explicit, constrained classification (Major /
   Minor / Bedside / Endoscopy / Others) used to drive the Surgery Card
   breakdown on the Dashboard and the Surgical Logbook's page layout rules
   (1 full page per Major case, up to 2 per page for Minor/Bedside/etc).
   This is separate from the existing free-text `surgery_type` column,
   which records the specific procedure/technique (e.g. "Laparoscopic")
   and is drawn from the user-managed `surgery_types` list. Rows saved
   before this column existed have `procedure_category = NULL`; app code
   falls back to its existing surgery_type-name heuristic in that case, so
   no backfill is required.
2. `implants` is a free-text field for implant details used during the
   procedure (e.g. mesh, plate, screws) — optional, blank by default.

Additive only — no existing column touched or dropped.
*/

ALTER TABLE surgeries
  ADD COLUMN IF NOT EXISTS procedure_category text DEFAULT NULL
    CHECK (procedure_category IS NULL OR procedure_category IN ('Major', 'Minor', 'Bedside', 'Endoscopy', 'Others')),
  ADD COLUMN IF NOT EXISTS implants text DEFAULT '';

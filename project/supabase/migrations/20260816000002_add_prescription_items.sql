/*
# Add structured prescription_items to patients

## Purpose
The Discharge Advice module needs a dynamic prescription table — rows AND
columns can be added/edited/reordered/deleted by the user (default columns:
Drug Name, Dose, Dosage/Frequency, No. of Days, Instructions) — alongside
the existing free-text `discharge_advice` and `prescription` fields.
Rather than a separate table (which would need its own RLS policies and
joins for what is always edited/read as one unit with its parent patient),
this is stored as a single JSONB object directly on `patients` — consistent
with how `image_paths` / `treatment_photo_paths` are already stored as
arrays on this table.

Shape: { "columns": [{ "key": "drug_name", "label": "Drug Name" }, ...],
         "rows": [{ "drug_name": "", "dose": "", ... }, ...] }

Additive only — existing `prescription` (free text) column is untouched.
*/

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS prescription_items jsonb NOT NULL DEFAULT '{"columns":[{"key":"drug_name","label":"Drug Name"},{"key":"dose","label":"Dose"},{"key":"frequency","label":"Dosage / Frequency"},{"key":"days","label":"No. of Days"},{"key":"instructions","label":"Instructions"}],"rows":[]}'::jsonb;

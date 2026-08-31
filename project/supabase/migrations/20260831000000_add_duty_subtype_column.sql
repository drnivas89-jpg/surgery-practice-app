/*
  # Add duty_subtype for 24-Hour Duty free-text sub-classification

  ## Purpose
  The unified attendance picker's "24 Hrs Duty" option (status='present',
  duty_type='duty') now captures an optional free-text "Type of Duty"
  (e.g. "ICU cover", "Casualty"). `duty_subtype` is nullable and only
  meaningful when duty_type='duty'.

  ## leave_type / extra_duty_type
  No DB change: both remain plain nullable `text` with no CHECK constraint.
  Going forward the app writes leave_type using a fixed set of slugs
  ('casual' | 'week_off' | 'medical' | 'pdo' | 'col') and extra_duty_type
  using ('col' | 'extra' | 'others' | free text for "Others"), but existing
  free-text rows written before this change remain valid, readable data —
  no backfill, no constraint that could reject them.
*/

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS duty_subtype text DEFAULT NULL;

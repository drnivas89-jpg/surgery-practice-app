/*
  # Government holidays + government-hospital flag (COL auto-credit)

  ## hospitals.is_government
  Marks a hospital as a government hospital (e.g. NMCH). Any duty worked
  there on a government holiday automatically counts as a COL credit
  (computed in the app — no attendance rows are rewritten). Existing
  hospitals whose name contains "NMCH" are flagged as government; every
  other hospital stays private until toggled on the Hospitals page.

  ## gov_holidays
  The doctor's own government holiday calendar, one row per date:
  - a named holiday (e.g. "Pongal") with is_cancelled = false, or
  - is_cancelled = true to cancel a holiday on that date — used to switch
    off an automatic second-Saturday holiday (second Saturdays are holidays
    by default and are NOT stored; only cancellations are).
  Owner-only RLS, same pattern as every other per-doctor table.

  Additive only: one new column with a default, one new table.
*/

ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS is_government boolean NOT NULL DEFAULT false;

UPDATE hospitals SET is_government = true WHERE name ILIKE '%nmch%';

CREATE TABLE IF NOT EXISTS gov_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name text NOT NULL DEFAULT '',
  is_cancelled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, holiday_date)
);

ALTER TABLE gov_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_gov_holidays" ON gov_holidays;
CREATE POLICY "select_own_gov_holidays" ON gov_holidays FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_gov_holidays" ON gov_holidays;
CREATE POLICY "insert_own_gov_holidays" ON gov_holidays FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_gov_holidays" ON gov_holidays;
CREATE POLICY "update_own_gov_holidays" ON gov_holidays FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_gov_holidays" ON gov_holidays;
CREATE POLICY "delete_own_gov_holidays" ON gov_holidays FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_gov_holidays_user_date ON gov_holidays (user_id, holiday_date);

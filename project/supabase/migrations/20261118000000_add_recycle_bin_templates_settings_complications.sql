/*
  # Recycle bin, operative-note templates, user settings, complications

  ## recycle_bin
  A snapshot of every record removed by a delete in the app (the row plus
  its dependent rows, as JSON), kept so it can be restored. The app purges
  entries older than 30 days.

  ## note_templates
  Saved operative-note templates, optionally tied to a procedure name.

  ## user_settings
  One row per doctor for preferences that must follow them across devices
  (currently yearly leave quotas), as JSON.

  ## surgeries.clavien_dindo / surgeries.complications
  Structured complication grade (Clavien–Dindo: none, I, II, IIIa, IIIb,
  IVa, IVb, V) plus free-text details, for research-grade outcome data.
  Nullable — existing cases are unaffected.

  Additive only; owner-only RLS on every new table.
*/

CREATE TABLE IF NOT EXISTS recycle_bin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS note_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  procedure_name text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE surgeries
  ADD COLUMN IF NOT EXISTS clavien_dindo text DEFAULT NULL
    CHECK (clavien_dindo IS NULL OR clavien_dindo IN ('none', 'I', 'II', 'IIIa', 'IIIb', 'IVa', 'IVb', 'V')),
  ADD COLUMN IF NOT EXISTS complications text DEFAULT NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['recycle_bin', 'note_templates', 'user_settings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "select_own_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "select_own_%s" ON %I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "insert_own_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "insert_own_%s" ON %I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "update_own_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "update_own_%s" ON %I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "delete_own_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "delete_own_%s" ON %I FOR DELETE TO authenticated USING (auth.uid() = user_id)', t, t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_recycle_bin_user_deleted ON recycle_bin (user_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_templates_user ON note_templates (user_id);

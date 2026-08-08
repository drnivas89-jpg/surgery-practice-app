/*
# Add consent image storage and consent proformas library

## Overview
Two changes:
1. Add consent_image_paths to surgeries so a scanned patient consent page can be uploaded per surgery.
2. Create consent_proformas — a shared, permanent library of typed consent proforma templates for various procedures in multiple languages. Any authenticated user can read, create, and edit them ("whoever accessing this").

## Modified Tables
### surgeries
- consent_image_paths (text[], default '{}') — storage paths for uploaded patient consent page images.

## New Tables
### consent_proformas
Shared consent proforma templates.
- id (uuid, PK)
- procedure_name (text, not null) — the procedure this proforma applies to
- language (text, not null) — language of the proforma text (e.g. English, Hindi, Tamil)
- content (text) — the full typed proforma body
- created_by (uuid, FK -> auth.users, nullable) — author for attribution
- created_at (timestamptz)
- updated_at (timestamptz)

## Security
- surgeries: no policy change (existing owner-scoped CRUD already covers the new column).
- consent_proformas: RLS enabled. Data is intentionally shared across all authenticated users:
  - SELECT TO authenticated USING (true) — any signed-in user can read every proforma.
  - INSERT/UPDATE/DELETE TO authenticated — any signed-in user can create/edit/remove.
*/

ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS consent_image_paths text[] DEFAULT '{}';

CREATE TABLE IF NOT EXISTS consent_proformas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_name text NOT NULL,
  language text NOT NULL DEFAULT 'English',
  content text DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE consent_proformas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_all_consent_proformas" ON consent_proformas;
CREATE POLICY "select_all_consent_proformas" ON consent_proformas FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_consent_proformas" ON consent_proformas;
CREATE POLICY "insert_consent_proformas" ON consent_proformas FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_consent_proformas" ON consent_proformas;
CREATE POLICY "update_consent_proformas" ON consent_proformas FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_consent_proformas" ON consent_proformas;
CREATE POLICY "delete_consent_proformas" ON consent_proformas FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_consent_proformas_procedure ON consent_proformas(procedure_name);
CREATE INDEX IF NOT EXISTS idx_consent_proformas_language ON consent_proformas(language);

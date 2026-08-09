/*
# Classes (teaching) and Publications

## Purpose
Two new independent record types the surgeon can log:
- classes: teaching sessions/lectures given, linked to a hospital
- publications: papers, posters, and journal articles authored

Both are fully editable after creation (standard owner-scoped CRUD),
and are designed to be optionally surfaced in Reports and the
Surgical Logbook (via app-level include/exclude toggles — no schema
changes needed for that part, it's just a display filter).

## classes
- id, user_id, hospital_id (FK)
- class_date
- class_type (e.g. CME, Workshop, Lecture — free text)
- audience (who the class was for — free text, e.g. "MBBS students",
  "Nursing staff")
- topic
- ppt_path (storage path to an uploaded PPT/PDF, optional)
- notes (optional)

## publications
- id, user_id
- publication_type (poster / paper / journal / other — free text)
- topic (title of the publication)
- author_details (free text — co-authors, author order, etc.)
- month, year (when published)
- platform (journal/conference name)
- file_path (optional uploaded copy of the publication)
- notes (optional)

## Security
RLS enabled on both, standard 4-policy owner-scoped CRUD pattern
matching every other table in this schema.
*/

CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid REFERENCES hospitals(id) ON DELETE SET NULL,
  class_date date,
  class_type text DEFAULT '',
  audience text DEFAULT '',
  topic text DEFAULT '',
  ppt_path text,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_classes" ON classes;
CREATE POLICY "select_own_classes" ON classes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_classes" ON classes;
CREATE POLICY "insert_own_classes" ON classes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_classes" ON classes;
CREATE POLICY "update_own_classes" ON classes FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_classes" ON classes;
CREATE POLICY "delete_own_classes" ON classes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_classes_hospital ON classes(hospital_id);
CREATE INDEX IF NOT EXISTS idx_classes_date ON classes(class_date);


CREATE TABLE IF NOT EXISTS publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  publication_type text DEFAULT '',
  topic text DEFAULT '',
  author_details text DEFAULT '',
  month integer,
  year integer,
  platform text DEFAULT '',
  file_path text,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_publications" ON publications;
CREATE POLICY "select_own_publications" ON publications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_publications" ON publications;
CREATE POLICY "insert_own_publications" ON publications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_publications" ON publications;
CREATE POLICY "update_own_publications" ON publications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_publications" ON publications;
CREATE POLICY "delete_own_publications" ON publications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_publications_year ON publications(year);

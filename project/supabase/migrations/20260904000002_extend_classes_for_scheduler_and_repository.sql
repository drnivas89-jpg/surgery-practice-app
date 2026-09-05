/*
  # Extend classes into an academic scheduler + presentation repository

  ## New columns
  - class_time: optional time-of-day (free text, e.g. "5:00 PM") — kept
    as text rather than a `time` column since sessions are often quoted
    loosely ("Evening", "9-10 AM") and this stays consistent with the
    free-text class_type/audience columns already on this table.
  - location: venue or platform (e.g. "Seminar Hall 2", "Zoom")
  - presenter: who is presenting/teaching
  - category: subspecialty/category tag for search/filtering (e.g.
    "General Surgery", "Journal Club")

  ## ppt_paths
  The existing ppt_path (single nullable text) becomes ppt_paths (text
  array), mirroring the surgeries.image_paths convention — a class can
  have multiple attached files (slides + a lecture PDF). Existing single
  uploads are backfilled into the array; ppt_path itself is left in
  place, unused by new code, rather than dropped, so no data is lost if
  anything still reads it.
*/

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS class_time text DEFAULT '',
  ADD COLUMN IF NOT EXISTS location text DEFAULT '',
  ADD COLUMN IF NOT EXISTS presenter text DEFAULT '',
  ADD COLUMN IF NOT EXISTS category text DEFAULT '',
  ADD COLUMN IF NOT EXISTS ppt_paths text[] DEFAULT '{}';

UPDATE classes
  SET ppt_paths = ARRAY[ppt_path]
  WHERE ppt_path IS NOT NULL AND (ppt_paths IS NULL OR ppt_paths = '{}');

CREATE INDEX IF NOT EXISTS idx_classes_category ON classes(category);

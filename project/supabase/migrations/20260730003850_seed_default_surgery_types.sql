/*
# Make surgery_types user_id nullable and seed defaults
The user_id column was NOT NULL, preventing shared default types from being seeded.
Making it nullable allows global default types. RLS still enforces ownership for
user-created types; default types with NULL user_id are selectable by all authenticated users.
*/

ALTER TABLE surgery_types ALTER COLUMN user_id DROP NOT NULL;

-- Update RLS: allow all authenticated users to SELECT surgery_types (shared defaults have NULL user_id)
DROP POLICY IF EXISTS "select_own_surgery_types" ON surgery_types;
CREATE POLICY "select_own_surgery_types" ON surgery_types FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR user_id IS NULL);

-- Seed the five default surgery types
INSERT INTO surgery_types (name)
VALUES ('Major'), ('Minor'), ('Bedside'), ('Endoscopy'), ('Others')
ON CONFLICT DO NOTHING;

/*
# Add role column to surgeries
Records whether a surgery was done by the surgeon or assisted by them.
- done_by_me: the surgeon performed the surgery
- assisted_by_me: the surgeon assisted in the surgery
*/

ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS role text DEFAULT 'done_by_me';

ALTER TABLE surgeries ADD CONSTRAINT surgeries_role_check
  CHECK (role IN ('done_by_me', 'assisted_by_me'));

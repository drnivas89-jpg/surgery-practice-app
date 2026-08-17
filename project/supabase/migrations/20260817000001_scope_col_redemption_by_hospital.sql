/*
# Scope the COL redemption unique index by hospital, not just user

## Background
The earlier migration (20260816000000_add_duty_type_and_col_linkage.sql)
added a unique index on (user_id, compensated_working_date) to stop the
same COL credit being redeemed twice. Now that COL is hospital-strict — a
credit earned at hospital A can only be redeemed at hospital A — that index
is too broad: it would also block a doctor from redeeming a coincidentally
same-dated credit at a *different* hospital, which is a legitimate,
separate credit. Re-scope it to (user_id, hospital_id,
compensated_working_date).

The old index is dropped and replaced; no data is deleted.
*/

DROP INDEX IF EXISTS idx_attendance_col_redemption;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_col_redemption
  ON attendance (user_id, hospital_id, compensated_working_date)
  WHERE compensated_working_date IS NOT NULL;

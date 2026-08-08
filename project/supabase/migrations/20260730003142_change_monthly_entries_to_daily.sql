/*
# Change hospital OP/IP entries from monthly to daily basis

## Overview
The monthly_entries table currently stores one aggregate row per hospital per month.
This migration adds daily granularity so the surgeon can record OP/IP counts and
fees on a per-day basis. A new `entry_date` column is added and backfilled from the
existing `month` column. The old (hospital_id, month) unique index is replaced with
(hospital_id, entry_date).

## Modified Tables
### monthly_entries
- Added column: entry_date (date) — the specific day of the entry.
- Backfilled entry_date from month (existing monthly entries keep the 1st of their month).
- Dropped unique index on (hospital_id, month).
- Created unique index on (hospital_id, entry_date).
*/

ALTER TABLE monthly_entries ADD COLUMN IF NOT EXISTS entry_date date;

UPDATE monthly_entries SET entry_date = month WHERE entry_date IS NULL;

DROP INDEX IF EXISTS idx_monthly_entries_hospital_month;

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_entries_hospital_entry_date
  ON monthly_entries(hospital_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_monthly_entries_entry_date ON monthly_entries(entry_date);

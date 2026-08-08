/*
# Add opinion_patients to monthly_entries

## Purpose
The Hospital daily-entry form previously let the surgeon manually type a
free-hand "IP Patients" count each day. Now that IP patients are tracked
as structured records (via the OP/IP Patient Entry feature, with their
own hospital-specific unique ID), that manual IP counter is repurposed
into an "Opinion Entry" counter — for quick logging of opinion/consult-
only visits that don't need a full patient record.

The existing `ip_patients` column is left untouched (it is still updated
automatically whenever a structured IP patient record is created), so
historical IP counts and dashboard IP figures remain accurate.

## Change
- Add `opinion_patients` (integer, default 0) to `monthly_entries`.
*/

ALTER TABLE monthly_entries
  ADD COLUMN IF NOT EXISTS opinion_patients integer NOT NULL DEFAULT 0;

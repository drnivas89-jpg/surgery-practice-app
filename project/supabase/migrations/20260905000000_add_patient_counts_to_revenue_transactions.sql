/*
  # Extend revenue_transactions to cover OP/IP/Opinion counts too

  ## Purpose
  revenue_transactions already lets a doctor log any number of discrete
  fee entries per hospital+day, summed live. The same gap existed for
  patient counts — monthly_entries.op_patients/ip_patients/opinion_patients
  is a single overwritable number per hospital+day. Rather than build a
  second, parallel multi-entry mechanism, this reuses the same table:
  each transaction row may now also carry an OP/IP/Opinion count (0 by
  default), summed alongside monthly_entries' single quick-total the same
  way amount_generated/amount_received already are.

  monthly_entries itself is unchanged — it remains a valid single-entry
  shortcut, additive with these transaction rows, not replaced by them.
*/

ALTER TABLE revenue_transactions
  ADD COLUMN IF NOT EXISTS op_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ip_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opinion_count integer NOT NULL DEFAULT 0;

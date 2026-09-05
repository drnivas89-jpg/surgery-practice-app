/*
  # Revenue transactions — multiple fee entries per hospital+day

  ## Purpose
  monthly_entries holds exactly one row per (hospital_id, entry_date),
  conflating OP/IP/Opinion patient counts with a single overwritable
  fees_generated/fees_received pair — a doctor can't log a separate
  morning consult fee, an evening round fee, and a cash settlement for
  the same hospital on the same day without overwriting each other.

  revenue_transactions is a new, append-only child log (patient counts
  on monthly_entries are untouched) — any number of transactions per
  hospital+day, each optionally generated and/or received. The day's
  totals become a live sum across every matching row instead of one
  hand-typed scalar.

  ## Columns
  - hospital_id, entry_date: which hospital+day this transaction belongs to
  - description: free text label, e.g. "Evening round fee", "Cash settlement"
  - amount_generated / amount_received: either or both may be 0 — a
    transaction can represent fee billed (generated), fee collected
    (received), or both at once

  ## Security
  Standard owner-scoped RLS, matching every other table in this schema.
*/

CREATE TABLE IF NOT EXISTS revenue_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  description text DEFAULT '',
  amount_generated numeric(12,2) NOT NULL DEFAULT 0,
  amount_received numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE revenue_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_revenue_transactions" ON revenue_transactions;
CREATE POLICY "select_own_revenue_transactions" ON revenue_transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_revenue_transactions" ON revenue_transactions;
CREATE POLICY "insert_own_revenue_transactions" ON revenue_transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_revenue_transactions" ON revenue_transactions;
CREATE POLICY "update_own_revenue_transactions" ON revenue_transactions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_revenue_transactions" ON revenue_transactions;
CREATE POLICY "delete_own_revenue_transactions" ON revenue_transactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_revenue_transactions_hospital_date ON revenue_transactions(hospital_id, entry_date);

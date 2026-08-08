/*
# Surgeon-to-surgeon data sharing

## Purpose
Let one surgeon invite a colleague (by email) to view their practice data
read-only, entirely within the app — no external file sharing needed.

## Design
- A new `collaborators` table records invitations: who owns the data
  (`owner_user_id`), who was invited (`invited_email`, and once they sign
  in and accept, `invited_user_id`), and the invite's `status`.
- Existing tables (hospitals, patients, surgeries, monthly_entries,
  attendance, payments) are NOT touched and their RLS policies are NOT
  changed — this keeps every existing screen exactly as safe as before.
- Instead, a set of SECURITY DEFINER read-only functions
  (`shared_*`) let an accepted collaborator pull an owner's data, but
  only SELECT, never INSERT/UPDATE/DELETE. This is how "view-only"
  sharing is enforced: there is no code path for a collaborator to
  write to someone else's data.

## Security
- RLS enabled on `collaborators`.
- Owners can see/manage invitations they created.
- Invited users can see invitations addressed to their signed-in email,
  and accept/decline them (which sets invited_user_id + status).
- The `shared_*` functions internally verify an accepted collaborator
  relationship exists before returning any row.
*/

CREATE TABLE IF NOT EXISTS collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  invited_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

ALTER TABLE collaborators ENABLE ROW LEVEL SECURITY;

-- Owner manages invitations they created
DROP POLICY IF EXISTS "owner_select_collaborators" ON collaborators;
CREATE POLICY "owner_select_collaborators" ON collaborators FOR SELECT
  TO authenticated USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "owner_insert_collaborators" ON collaborators;
CREATE POLICY "owner_insert_collaborators" ON collaborators FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "owner_update_collaborators" ON collaborators;
CREATE POLICY "owner_update_collaborators" ON collaborators FOR UPDATE
  TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "owner_delete_collaborators" ON collaborators;
CREATE POLICY "owner_delete_collaborators" ON collaborators FOR DELETE
  TO authenticated USING (auth.uid() = owner_user_id);

-- Invited user can see + respond to invitations addressed to their email
DROP POLICY IF EXISTS "invitee_select_collaborators" ON collaborators;
CREATE POLICY "invitee_select_collaborators" ON collaborators FOR SELECT
  TO authenticated USING (
    invited_user_id = auth.uid()
    OR lower(invited_email) = lower(auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "invitee_update_collaborators" ON collaborators;
CREATE POLICY "invitee_update_collaborators" ON collaborators FOR UPDATE
  TO authenticated USING (
    invited_user_id = auth.uid()
    OR lower(invited_email) = lower(auth.jwt() ->> 'email')
  ) WITH CHECK (
    invited_user_id = auth.uid()
    OR lower(invited_email) = lower(auth.jwt() ->> 'email')
  );

CREATE INDEX IF NOT EXISTS idx_collaborators_owner ON collaborators(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_invited_user ON collaborators(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_invited_email ON collaborators(lower(invited_email));

-- Helper: is the current user an accepted collaborator for this owner?
CREATE OR REPLACE FUNCTION is_accepted_collaborator(p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM collaborators c
    WHERE c.owner_user_id = p_owner_id
      AND c.invited_user_id = auth.uid()
      AND c.status = 'accepted'
  );
$$;

-- Read-only shared-data functions (one per table needed for the shared view)
CREATE OR REPLACE FUNCTION shared_hospitals(p_owner_id uuid)
RETURNS SETOF hospitals LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM hospitals WHERE user_id = p_owner_id AND is_accepted_collaborator(p_owner_id);
$$;

CREATE OR REPLACE FUNCTION shared_patients(p_owner_id uuid)
RETURNS SETOF patients LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM patients WHERE user_id = p_owner_id AND is_accepted_collaborator(p_owner_id);
$$;

CREATE OR REPLACE FUNCTION shared_surgeries(p_owner_id uuid)
RETURNS SETOF surgeries LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM surgeries WHERE user_id = p_owner_id AND is_accepted_collaborator(p_owner_id);
$$;

CREATE OR REPLACE FUNCTION shared_monthly_entries(p_owner_id uuid)
RETURNS SETOF monthly_entries LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM monthly_entries WHERE user_id = p_owner_id AND is_accepted_collaborator(p_owner_id);
$$;

CREATE OR REPLACE FUNCTION shared_attendance(p_owner_id uuid)
RETURNS SETOF attendance LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM attendance WHERE user_id = p_owner_id AND is_accepted_collaborator(p_owner_id);
$$;

CREATE OR REPLACE FUNCTION shared_payments(p_owner_id uuid)
RETURNS SETOF payments LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM payments WHERE user_id = p_owner_id AND is_accepted_collaborator(p_owner_id);
$$;

-- Lets an owner show a human-readable name/email for who they've invited,
-- and lets an invitee see the owner's email in their pending/accepted list.
CREATE OR REPLACE FUNCTION user_email_for_collaborator(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT email FROM auth.users WHERE id = p_user_id;
$$;

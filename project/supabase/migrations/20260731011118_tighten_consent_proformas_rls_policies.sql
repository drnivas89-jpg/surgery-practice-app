-- Replace overly-permissive INSERT/UPDATE/DELETE policies on consent_proformas
-- with ownership-scoped policies using created_by = auth.uid().
-- SELECT remains open to all authenticated users (shared proforma library).

DROP POLICY IF EXISTS insert_consent_proformas ON public.consent_proformas;
DROP POLICY IF EXISTS update_consent_proformas ON public.consent_proformas;
DROP POLICY IF EXISTS delete_consent_proformas ON public.consent_proformas;

CREATE POLICY insert_own_consent_proformas ON public.consent_proformas
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY update_own_consent_proformas ON public.consent_proformas
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY delete_own_consent_proformas ON public.consent_proformas
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

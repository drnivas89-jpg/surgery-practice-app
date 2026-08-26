/*
# Add attachment_paths to investigations

## Purpose
The Investigations tab on Patient Details needs a full image/attachment
viewer (lab panels, USG/CT/MRI/X-ray images, histology report scans), same
pattern as `surgeries.image_paths` and `follow_ups.report_image_paths` —
an array of Supabase Storage object paths in the existing `surgery-images`
bucket, resolved to signed URLs client-side via `getImageUrl`.

Additive only — no existing column touched.
*/

ALTER TABLE investigations
  ADD COLUMN IF NOT EXISTS attachment_paths text[] NOT NULL DEFAULT '{}';

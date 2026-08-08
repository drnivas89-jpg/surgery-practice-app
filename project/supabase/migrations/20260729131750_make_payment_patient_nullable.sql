/*
# Make payments.patient_id nullable

## Overview
Currently the payments table requires a patient_id (NOT NULL with FK).
This change makes patient_id nullable so payments can be recorded
at the hospital level without needing to select a patient.

## Modified Tables
### payments
- patient_id: changed from NOT NULL to nullable (DROP NOT NULL constraint)
*/

ALTER TABLE payments ALTER COLUMN patient_id DROP NOT NULL;

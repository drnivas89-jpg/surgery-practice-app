export type ClavienDindo = 'none' | 'I' | 'II' | 'IIIa' | 'IIIb' | 'IVa' | 'IVb' | 'V';

export const CLAVIEN_DINDO: { value: ClavienDindo; label: string; hint: string }[] = [
  { value: 'none', label: 'No complication', hint: 'Uneventful course' },
  { value: 'I', label: 'Grade I', hint: 'Deviation needing no drugs or intervention beyond antiemetics, analgesics, diuretics, electrolytes, physiotherapy; bedside wound opening' },
  { value: 'II', label: 'Grade II', hint: 'Needs other drugs, blood transfusion or TPN' },
  { value: 'IIIa', label: 'Grade IIIa', hint: 'Surgical/endoscopic/radiological intervention, not under GA' },
  { value: 'IIIb', label: 'Grade IIIb', hint: 'Intervention under general anaesthesia' },
  { value: 'IVa', label: 'Grade IVa', hint: 'Life-threatening: single-organ dysfunction (ICU)' },
  { value: 'IVb', label: 'Grade IVb', hint: 'Life-threatening: multi-organ dysfunction' },
  { value: 'V', label: 'Grade V', hint: 'Death of the patient' },
];

export const clavienLabel = (v: string | null | undefined) => CLAVIEN_DINDO.find((c) => c.value === v)?.label || '';

// Grade III or worse is a "major" complication in most outcome reporting.
export const isMajorComplication = (v: string | null | undefined) => !!v && ['IIIa', 'IIIb', 'IVa', 'IVb', 'V'].includes(v);

export const OUTCOME_DUE_DAYS = 30;

import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
const { buildCaseOutline } = await import('./caseSlides');
import type { Patient, Surgery } from './types';

const patient = {
  id: 'p1', patient_name: 'Lakshmi Devi', unique_id: 'GH-7781', mobile_number: '9876543210',
  age: 52, sex: 'female', diagnosis: 'Carcinoma left breast',
} as Patient;
const surgery = {
  id: 's1', procedure_name: 'Modified radical mastectomy', procedure_category: 'Major', anaesthesia_type: 'GA',
  implants: '', role: 'done_by_me', surgery_date: '2026-09-14', procedure_notes: 'Level II clearance done.',
  outcome: 'Seroma, aspirated', clavien_dindo: 'I', image_paths: ['a.jpg'], consent_image_paths: ['consent.jpg'],
} as unknown as Surgery;

describe('case slides outline', () => {
  const o = buildCaseOutline({
    patient, surgery, investigations: [], visits: [],
    hpe: { findings: 'IDC grade 2, margins free' } as never,
  });

  it('contains no direct identifiers or consent images', () => {
    const text = JSON.stringify(o);
    for (const id of ['Lakshmi', 'GH-7781', '9876543210', '14', 'consent.jpg']) expect(text).not.toContain(id);
  });

  it('summarises the case', () => {
    expect(o.title).toBe('Carcinoma left breast');
    expect(o.demographics).toBe('50–59 years · Female');
    expect(o.procedureFacts).toContainEqual(['When', 'September 2026']);
    expect(o.outcome[0]).toBe('Complication: Clavien–Dindo Grade I');
    expect(o.hpe).toBe('IDC grade 2, margins free');
  });

  it('gives follow-ups as days after surgery, not dates', () => {
    const withVisit = buildCaseOutline({ patient, surgery, investigations: [], hpe: undefined, visits: [{ visit_date: '2026-09-24', notes: 'Drain removed' }] as never });
    expect(withVisit.outcome).toContain('Day 10 — Drain removed');
  });
});

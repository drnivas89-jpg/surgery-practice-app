import { describe, expect, it } from 'vitest';
import { dateInName, findReusable, matchFilesToClasses, topicTokens } from './pptMatch';

const classes = [
  { id: 'a', topic: 'Inguinal Hernia', class_date: '2026-11-04' },
  { id: 'b', topic: 'Acute Pancreatitis – management', class_date: '2026-11-11' },
  { id: 'c', topic: 'Thyroid nodules', class_date: '2026-11-18' },
  { id: 'd', topic: 'Case discussion', class_date: '2026-11-25' },
];

describe('PPT matching', () => {
  it('tokenises topics and file names alike', () => {
    expect(topicTokens('Inguinal_hernias_FINAL v2.pptx')).toEqual(['inguinal', 'hernia']);
  });

  it('reads dates written in file names', () => {
    expect(dateInName('2026-11-25 case.pptx')).toBe('2026-11-25');
    expect(dateInName('case 25.11.26.pdf')).toBe('2026-11-25');
    expect(dateInName('case_25_11_2026.pptx')).toBe('2026-11-25');
    expect(dateInName('thyroid.pptx')).toBeNull();
    expect(dateInName('scan 45.13.2026.pdf')).toBeNull();
  });

  it('matches files by topic, then by date, one file per class', () => {
    expect(matchFilesToClasses(
      ['pancreatitis_mgmt.pptx', 'Hernia-inguinal.ppt', 'presentation 25-11-2026.pptx', 'Thyroid nodule final.pdf', 'random notes.pptx'],
      classes,
    )).toEqual(['b', 'a', 'd', 'c', null]);
  });

  it('does not give two files the same class', () => {
    const result = matchFilesToClasses(['hernia.pptx', 'inguinal hernia.pptx'], classes);
    expect(result.filter((r) => r === 'a')).toHaveLength(1);
    expect(result.filter((r) => r === null)).toHaveLength(1);
  });

  it('offers slides from an earlier class on the same topic', () => {
    const past = [
      { id: 'old1', topic: 'Inguinal hernia', class_date: '2025-02-01', ppt_paths: ['x.pptx'] },
      { id: 'old2', topic: 'Inguinal hernia repair', class_date: '2025-09-01', ppt_paths: ['y.pptx'] },
      { id: 'old3', topic: 'Thyroid', class_date: '2025-09-01', ppt_paths: [] },
    ];
    expect(findReusable(classes[0], past)?.id).toBe('old1');
    expect(findReusable(classes[2], past)).toBeNull();
  });
});

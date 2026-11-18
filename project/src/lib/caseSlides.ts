import type { FollowUp, FollowUpVisit, Investigation, Patient, Surgery } from './types';
import { getImageUrl } from './helpers';
import { daysBetween } from './alerts';
import { ageBand } from './logbookExport';
import { clavienLabel } from './complications';

// 16:9 slides in points. A PDF opened full-screen presents like a deck.
const W = 960;
const H = 540;
const M = 48;
const NAVY: [number, number, number] = [15, 23, 42];
const TEAL: [number, number, number] = [13, 148, 136];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];

export interface CaseSlidesInput {
  patient: Patient;
  surgery: Surgery;
  investigations: Investigation[];
  hpe: FollowUp | undefined;
  visits: FollowUpVisit[];
  presenter: string;
}

const sexWord = (s: Patient['sex']) => (s === 'male' ? 'Male' : s === 'female' ? 'Female' : s === 'other' ? 'Other' : '');
const monthYear = (d: string | null) => {
  if (!d) return '';
  const [y, m] = d.substring(0, 10).split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

/**
 * Outline of the deck, kept separate from drawing so it can be tested.
 * Patient name, case ID, mobile number and consent images never appear:
 * age is shown as a 10-year band and dates as month + year.
 */
export function buildCaseOutline({ patient, surgery, investigations, hpe, visits }: Omit<CaseSlidesInput, 'presenter'>) {
  const demographics = [ageBand(patient.age) && `${ageBand(patient.age)} years`, sexWord(patient.sex)].filter(Boolean).join(' · ');
  const procedureFacts: [string, string][] = ([
    ['Procedure', surgery.procedure_name],
    ['Classification', surgery.procedure_category || ''],
    ['Anaesthesia', surgery.anaesthesia_type],
    ['Implants', surgery.implants],
    ['Role', surgery.role === 'assisted_by_me' ? 'Assisted' : 'Operating surgeon'],
    ['When', monthYear(surgery.surgery_date)],
  ] as [string, string][]).filter(([, v]) => (v || '').trim());
  const invRows = investigations
    .filter((i) => i.investigation_name.trim())
    .map((i) => `${i.investigation_name}${i.value ? `: ${i.value}` : ''}${i.notes ? ` (${i.notes})` : ''}`);
  const outcome = [
    surgery.clavien_dindo ? (surgery.clavien_dindo === 'none' ? 'No complication' : `Complication: Clavien–Dindo ${clavienLabel(surgery.clavien_dindo)}`) : '',
    surgery.outcome || '',
    // Days after surgery rather than calendar dates, so visits can't be matched to a register.
    ...[...visits].sort((a, b) => a.visit_date.localeCompare(b.visit_date)).slice(0, 4).map((v) => {
      const when = surgery.surgery_date ? `Day ${daysBetween(surgery.surgery_date.substring(0, 10), v.visit_date.substring(0, 10))}` : 'Follow-up';
      return `${when}${v.notes ? ` — ${v.notes}` : ''}`;
    }),
  ].filter((s) => s.trim());
  return {
    title: patient.diagnosis?.trim() || surgery.procedure_name || 'Case presentation',
    demographics,
    procedureFacts,
    invRows,
    findings: (surgery.procedure_notes || '').trim(),
    hpe: hpe && (hpe.findings || '').trim() ? hpe.findings!.trim() : '',
    outcome,
    imagePaths: surgery.image_paths || [],
  };
}

async function loadImage(path: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const url = await getImageUrl(path);
    if (!url) return null;
    const blob = await (await fetch(url)).blob();
    const bitmap = await createImageBitmap(blob);
    // Re-encode through a canvas: normalises HEIC/WebP/PNG to JPEG and caps size.
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', 0.85), w: canvas.width, h: canvas.height };
  } catch {
    return null;
  }
}

export async function downloadCaseSlides(input: CaseSlidesInput) {
  const { default: jsPDF } = await import('jspdf');
  const o = buildCaseOutline(input);
  const doc = new jsPDF({ unit: 'pt', format: [W, H], orientation: 'landscape' });
  let first = true;

  const slide = (heading: string) => {
    if (!first) doc.addPage([W, H], 'landscape');
    first = false;
    doc.setFillColor(...TEAL);
    doc.rect(0, 0, 10, H, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(...NAVY);
    doc.text(heading, M, 72);
    doc.setDrawColor(226, 232, 240);
    doc.line(M, 88, W - M, 88);
  };
  const paragraph = (text: string, y: number, size = 16, maxLines = 16) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...INK);
    let lines = doc.splitTextToSize(text, W - 2 * M) as string[];
    if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), '…'];
    doc.text(lines, M, y, { lineHeightFactor: 1.35 });
  };
  const bullets = (items: string[], y: number, size = 17) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    let cy = y;
    for (const item of items) {
      const lines = doc.splitTextToSize(item, W - 2 * M - 22) as string[];
      if (cy + lines.length * size * 1.35 > H - M) { doc.setTextColor(...MUTED); doc.text('…', M + 22, cy); break; }
      doc.setFillColor(...TEAL);
      doc.circle(M + 5, cy - size * 0.32, 3.5, 'F');
      doc.setTextColor(...INK);
      doc.text(lines, M + 22, cy, { lineHeightFactor: 1.35 });
      cy += lines.length * size * 1.35 + 8;
    }
  };

  // 1. Title
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, H, 'F');
  doc.setFillColor(...TEAL);
  doc.rect(M, 200, 64, 6, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.setTextColor(148, 163, 184);
  doc.text('CASE PRESENTATION', M, 180);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(38);
  doc.setTextColor(255, 255, 255);
  doc.text(doc.splitTextToSize(o.title, W - 2 * M).slice(0, 3), M, 256, { lineHeightFactor: 1.2 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(18);
  doc.setTextColor(203, 213, 225);
  if (o.demographics) doc.text(o.demographics, M, 400);
  if (input.presenter.trim()) doc.text(input.presenter.trim(), M, 440);
  first = false;

  // 2. Clinical summary
  slide('Clinical summary');
  bullets([
    o.demographics && `Patient: ${o.demographics}`,
    input.patient.diagnosis && `Diagnosis: ${input.patient.diagnosis}`,
    ...(o.invRows.length ? ['Investigations:'] : []),
  ].filter(Boolean) as string[], 130);
  if (o.invRows.length) {
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    const startY = 130 + 2 * 17 * 1.35 + 16 + 30;
    doc.text(o.invRows.slice(0, 10).map((r) => `   –  ${r}`).flatMap((r) => doc.splitTextToSize(r, W - 2 * M - 30) as string[]).slice(0, 12), M + 22, startY, { lineHeightFactor: 1.4 });
  }

  // 3. Procedure
  slide('Procedure');
  doc.setFontSize(17);
  o.procedureFacts.forEach(([k, v], i) => {
    const y = 140 + i * 44;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MUTED);
    doc.text(k, M, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...INK);
    doc.text((doc.splitTextToSize(v, W - 2 * M - 200) as string[]).slice(0, 2), M + 200, y);
  });

  // 4. Operative findings
  if (o.findings) {
    slide('Operative findings');
    paragraph(o.findings, 132);
  }

  // 5. Images, two per slide
  const images = (await Promise.all(o.imagePaths.slice(0, 8).map(loadImage))).filter((i): i is NonNullable<typeof i> => !!i);
  for (let i = 0; i < images.length; i += 2) {
    slide(images.length > 2 ? `Images (${i / 2 + 1}/${Math.ceil(images.length / 2)})` : 'Images');
    const pair = images.slice(i, i + 2);
    const boxW = pair.length === 1 ? W - 2 * M : (W - 2 * M - 24) / 2;
    const boxH = H - 112 - M;
    pair.forEach((img, j) => {
      const s = Math.min(boxW / img.w, boxH / img.h);
      const w = img.w * s;
      const h = img.h * s;
      const x = M + j * (boxW + 24) + (boxW - w) / 2;
      doc.addImage(img.data, 'JPEG', x, 112 + (boxH - h) / 2, w, h);
    });
  }

  // 6. Histopathology
  if (o.hpe) {
    slide('Histopathology');
    paragraph(o.hpe, 132);
  }

  // 7. Outcome
  slide('Outcome & follow-up');
  bullets(o.outcome.length ? o.outcome : ['Outcome not recorded yet.'], 130);

  // 8. Discussion (left for the presenter)
  slide('Discussion & learning points');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(16);
  doc.setTextColor(...MUTED);
  doc.text('Add your discussion points and references here.', M, 140);

  const safe = o.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'case';
  doc.save(`case-slides-${safe}.pdf`);
}

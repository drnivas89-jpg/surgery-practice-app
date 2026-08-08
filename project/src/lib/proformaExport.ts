import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import { ConsentProforma } from '@/lib/types';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-z0-9_\-\s]/gi, '').trim().replace(/\s+/g, '_') || 'consent_proforma';
}

export function downloadProformaPdf(p: ConsentProforma): void {
  const doc = new jsPDF({ unit: 'pt' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(p.procedure_name, margin, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(120, 120, 120);
  doc.text(`Language: ${p.language}`, margin, y);
  y += 18;

  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  doc.setTextColor(40, 40, 40);
  doc.setFontSize(11);

  const lines = (p.content || '').split('\n');
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line || ' ', maxWidth) as string[];
    for (const w of wrapped) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(w, margin, y);
      y += 16;
    }
  }

  y += 30;
  if (y > doc.internal.pageSize.getHeight() - margin) {
    doc.addPage();
    y = margin;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.text('Patient Signature: ______________________', margin, y);
  doc.text('Date: ________________', margin + 280, y);
  y += 30;
  doc.text('Surgeon Signature: ______________________', margin, y);

  doc.save(`${sanitizeFileName(p.procedure_name)}_${p.language}.pdf`);
}

export async function downloadProformaWord(p: ConsentProforma): Promise<void> {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      text: p.procedure_name,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.LEFT,
    }),
    new Paragraph({
      children: [new TextRun({ text: `Language: ${p.language}`, italics: true, color: '777777' })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [],
      border: { bottom: { color: 'DDDDDD', space: 1, style: 'single', size: 6 } },
      spacing: { after: 200 },
    }),
  ];

  const contentLines = (p.content || '').split('\n');
  for (const line of contentLines) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: line, size: 22 })],
        spacing: { after: 120 },
      })
    );
  }

  paragraphs.push(
    new Paragraph({ children: [], spacing: { before: 400 } }),
    new Paragraph({
      children: [new TextRun({ text: 'Patient Signature: ______________________', size: 22 })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Date: ________________', size: 22 }),
        new TextRun({ text: '      ', size: 22 }),
        new TextRun({ text: 'Surgeon Signature: ______________________', size: 22 }),
      ],
      spacing: { after: 200 },
    })
  );

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${sanitizeFileName(p.procedure_name)}_${p.language}.docx`);
}

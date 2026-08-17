import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Patient, Hospital, Surgery, ClassEntry, Publication, Investigation } from '@/lib/types';
import { formatDate, getImageUrl } from '@/lib/helpers';
import { Activity, Download, Filter, X, GraduationCap, BookOpen } from 'lucide-react';
import jsPDF from 'jspdf';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SURGERY_CATEGORIES = ['Major', 'Minor', 'Bedside', 'Endoscopy', 'Others'] as const;
function categorize(surgeryType: string | null | undefined): typeof SURGERY_CATEGORIES[number] {
  const t = (surgeryType || '').trim().toLowerCase();
  const match = SURGERY_CATEGORIES.find((c) => c.toLowerCase() === t);
  return match || 'Others';
}

// Clinical palette used throughout the exported PDF.
const NAVY: [number, number, number] = [30, 41, 59];      // #1E293B
const TEAL: [number, number, number] = [13, 148, 136];     // #0D9488
const BORDER: [number, number, number] = [226, 232, 240];  // #E2E8F0
const MUTED: [number, number, number] = [100, 116, 139];   // slate-500, for secondary text

interface LogbookRow {
  surgery: Surgery;
  patient: Patient | null;
  hospital: Hospital | null;
}

interface LoadedImage {
  dataUrl: string;
  format: 'JPEG' | 'PNG';
  width: number;
  height: number;
}

// Fetches a (signed) image URL and converts it to a data URL jsPDF can
// embed directly, along with its natural dimensions for aspect-correct
// placement. Returns null on any failure so a broken image just gets
// skipped rather than aborting the whole export.
async function loadImageForPdf(url: string): Promise<LoadedImage | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const format: 'JPEG' | 'PNG' = blob.type.includes('png') ? 'PNG' : 'JPEG';
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
      img.onerror = () => resolve({ width: 1, height: 1 });
      img.src = dataUrl;
    });
    return { dataUrl, format, width, height };
  } catch {
    return null;
  }
}

// Simple, original silhouette-style vector graphic (drawn with jsPDF's own
// shape primitives, not a raster image) so it stays crisp at any size.
function drawSurgeonIllustration(doc: jsPDF, cx: number, cy: number) {
  doc.setFillColor(...BORDER);
  doc.circle(cx, cy, 95, 'F');
  doc.setFillColor(...NAVY);
  doc.lines([[40, 0], [15, 55], [-110, 0], [15, -55]], cx - 40, cy + 25, [1, 1], 'F', true);
  doc.setFillColor(...NAVY);
  doc.circle(cx, cy - 15, 38, 'F');
  doc.setFillColor(...TEAL);
  doc.ellipse(cx, cy - 40, 42, 22, 'F');
  doc.setFillColor(...TEAL);
  doc.roundedRect(cx - 27, cy - 8, 54, 28, 9, 9, 'F');
}

export default function SurgicalLogbook() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LogbookRow[]>([]);
  const [investigationsByPatient, setInvestigationsByPatient] = useState<Map<string, Investigation[]>>(new Map());
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [includeClasses, setIncludeClasses] = useState(false);
  const [includePublications, setIncludePublications] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [doctorName, setDoctorName] = useState('');
  const [qualifications, setQualifications] = useState('');

  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: surgeries }, { data: patients }, { data: hospitals }, { data: cls }, { data: pubs }, { data: invs }] = await Promise.all([
        supabase.from('surgeries').select('*').order('surgery_date', { ascending: false, nullsFirst: false }),
        supabase.from('patients').select('*, hospital:hospitals(*)'),
        supabase.from('hospitals').select('*').order('name'),
        supabase.from('classes').select('*, hospital:hospitals(*)').order('class_date', { ascending: false }),
        supabase.from('publications').select('*').order('year', { ascending: false }),
        supabase.from('investigations').select('*'),
      ]);
      const patientMap = new Map<string, Patient>();
      (patients || []).forEach((p: Patient) => patientMap.set(p.id, p));
      const hospitalMap = new Map<string, Hospital>();
      (hospitals || []).forEach((h: Hospital) => hospitalMap.set(h.id, h));
      const built: LogbookRow[] = (surgeries || []).map((s: Surgery) => ({
        surgery: s,
        patient: patientMap.get(s.patient_id) || null,
        hospital: hospitalMap.get(patientMap.get(s.patient_id)?.hospital_id || '') || null,
      }));
      setRows(built);
      setClasses(cls || []);
      setPublications(pubs || []);

      const invByPatient = new Map<string, Investigation[]>();
      (invs || []).forEach((inv: Investigation) => {
        const list = invByPatient.get(inv.patient_id) || [];
        list.push(inv);
        invByPatient.set(inv.patient_id, list);
      });
      setInvestigationsByPatient(invByPatient);
      setLoading(false);

      const allPaths = (surgeries || []).flatMap((s: Surgery) => [
        ...(s.image_paths || []),
        ...(s.consent_image_paths || []),
      ]);
      const urlMap: Record<string, string> = {};
      for (const path of allPaths) {
        const url = await getImageUrl(path);
        if (url) urlMap[path] = url;
      }
      setImageUrls(urlMap);
    })();
  }, [user]);

  const availableYears = Array.from(
    new Set(
      rows
        .map((r) => r.surgery.surgery_date ? new Date(r.surgery.surgery_date).getFullYear() : null)
        .filter((y): y is number => y !== null)
    )
  ).sort((a, b) => b - a);

  const availableHospitals = Array.from(
    new Map(rows.map((r) => r.hospital ? [r.hospital.id, r.hospital] : null).filter(Boolean) as [string, Hospital][]).values()
  );

  const availableTypes = Array.from(
    new Set(rows.map((r) => r.surgery.surgery_type).filter(Boolean))
  ).sort();

  const filtered = rows.filter((r) => {
    if (monthFilter) {
      if (!r.surgery.surgery_date) return false;
      const m = new Date(r.surgery.surgery_date).getMonth().toString();
      if (m !== (MONTHS.indexOf(monthFilter)).toString()) return false;
    }
    if (yearFilter) {
      if (!r.surgery.surgery_date) return false;
      if (new Date(r.surgery.surgery_date).getFullYear().toString() !== yearFilter) return false;
    }
    if (hospitalFilter) {
      if (r.hospital?.id !== hospitalFilter) return false;
    }
    if (typeFilter) {
      if (r.surgery.surgery_type !== typeFilter) return false;
    }
    return true;
  });

  const activeFilters: string[] = [];
  if (monthFilter) activeFilters.push(`Month: ${monthFilter}`);
  if (yearFilter) activeFilters.push(`Year: ${yearFilter}`);
  if (hospitalFilter) activeFilters.push(`Hospital: ${availableHospitals.find((h) => h.id === hospitalFilter)?.name || hospitalFilter}`);
  if (typeFilter) activeFilters.push(`Type: ${typeFilter}`);

  const clearFilters = () => {
    setMonthFilter(''); setYearFilter(''); setHospitalFilter(''); setTypeFilter('');
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF({ unit: 'pt' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      const maxWidth = pageWidth - margin * 2;
      let y = margin;
      let page = 1;

      const addPageNumber = () => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(`Page ${page}`, pageWidth / 2, pageHeight - 20, { align: 'center' });
      };
      const newPage = () => { addPageNumber(); doc.addPage(); page++; y = margin; };

      // ---- Pre-fetch every image needed as an embeddable data URL ----
      const neededPaths = new Set<string>();
      filtered.forEach((r) => {
        (r.surgery.image_paths || []).forEach((p) => neededPaths.add(p));
        (r.surgery.consent_image_paths || []).forEach((p) => neededPaths.add(p));
      });
      const imageDataMap = new Map<string, LoadedImage>();
      for (const path of neededPaths) {
        const url = imageUrls[path];
        if (!url) continue;
        const loaded = await loadImageForPdf(url);
        if (loaded) imageDataMap.set(path, loaded);
      }

      // ---- Cover Page ----
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(1);
      doc.rect(24, 24, pageWidth - 48, pageHeight - 48);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(34);
      doc.setTextColor(...NAVY);
      doc.text('LOGBOOK', pageWidth / 2, pageHeight * 0.22, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(13);
      doc.setTextColor(...NAVY);
      const nameLine = [doctorName.trim(), qualifications.trim()].filter(Boolean).join(', ');
      if (nameLine) doc.text(nameLine, pageWidth / 2, pageHeight * 0.22 + 34, { align: 'center' });

      const datedFiltered = filtered.filter((r) => r.surgery.surgery_date).map((r) => r.surgery.surgery_date!.substring(0, 10)).sort();
      const rangeText = datedFiltered.length > 0
        ? `From ${formatDate(datedFiltered[0])} to ${formatDate(datedFiltered[datedFiltered.length - 1])}`
        : '';
      if (rangeText) {
        doc.setFontSize(11);
        doc.setTextColor(...TEAL);
        doc.text(rangeText, pageWidth / 2, pageHeight * 0.22 + 54, { align: 'center' });
      }

      drawSurgeonIllustration(doc, pageWidth / 2, pageHeight * 0.62);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(`Generated ${new Date().toLocaleDateString('en-GB')} · ${filtered.length} case${filtered.length !== 1 ? 's' : ''}`, pageWidth / 2, pageHeight - 50, { align: 'center' });

      addPageNumber();
      doc.addPage();
      page++;
      y = margin;

      // ---- Table of Contents ----
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...NAVY);
      doc.text('Table of Contents', margin, y);
      y += 10;
      doc.setDrawColor(...BORDER);
      doc.line(margin, y, pageWidth - margin, y);
      y += 22;

      const byDate = new Map<string, LogbookRow[]>();
      for (const r of filtered) {
        const key = r.surgery.surgery_date ? r.surgery.surgery_date.substring(0, 10) : 'No Date';
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key)!.push(r);
      }
      const sortedDates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      for (const d of sortedDates) {
        if (y > pageHeight - margin) newPage();
        const label = d === 'No Date' ? 'Undated' : formatDate(d);
        const count = byDate.get(d)!.length;
        doc.text(`${label}`, margin, y);
        doc.text(`${count} case${count > 1 ? 's' : ''}`, pageWidth - margin, y, { align: 'right' });
        y += 16;
      }
      newPage();

      // ---- Case Pages ----
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...NAVY);
      doc.text('Case Details', margin, y);
      y += 10;
      doc.setDrawColor(...BORDER);
      doc.line(margin, y, pageWidth - margin, y);
      y += 26;

      const sortedRows = [...filtered].sort((a, b) => (a.surgery.surgery_date || '').localeCompare(b.surgery.surgery_date || ''));
      let compactOnPage = 0;

      const drawImageGrid = (paths: string[], label: string, thumbSize: number, perRow: number) => {
        const withData = paths.map((p) => imageDataMap.get(p)).filter((d): d is LoadedImage => !!d);
        if (withData.length === 0) return;
        if (y + 16 > pageHeight - margin) newPage();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...TEAL);
        doc.text(label, margin, y);
        y += 12;
        let col = 0;
        for (const img of withData) {
          if (col === perRow) { col = 0; y += thumbSize + 8; }
          if (y + thumbSize > pageHeight - margin) { newPage(); col = 0; }
          const x = margin + col * (thumbSize + 8);
          const ratio = img.width / img.height;
          let drawW = thumbSize, drawH = thumbSize;
          if (ratio > 1) drawH = thumbSize / ratio; else drawW = thumbSize * ratio;
          doc.setDrawColor(...BORDER);
          doc.rect(x, y, thumbSize, thumbSize);
          doc.addImage(img.dataUrl, img.format, x + (thumbSize - drawW) / 2, y + (thumbSize - drawH) / 2, drawW, drawH);
          col++;
        }
        y += thumbSize + 14;
      };

      const drawCaseHeader = (r: LogbookRow, big: boolean) => {
        const p = r.patient;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(big ? 15 : 12);
        doc.setTextColor(...NAVY);
        doc.text(p?.patient_name || 'Unknown patient', margin, y);
        const category = categorize(r.surgery.surgery_type);
        const badgeText = category;
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        const badgeW = doc.getTextWidth(badgeText) + 14;
        doc.setFillColor(...TEAL);
        doc.roundedRect(pageWidth - margin - badgeW, y - 11, badgeW, 15, 4, 4, 'F');
        doc.text(badgeText, pageWidth - margin - badgeW / 2, y - 1, { align: 'center' });
        y += big ? 18 : 14;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(big ? 9.5 : 8.5);
        doc.setTextColor(...MUTED);
        const idStr = p?.unique_id || '—';
        const ageStr = p?.age != null ? `${p.age}y` : '—';
        const sexStr = p?.sex || '—';
        doc.text(`ID: ${idStr}   Age/Sex: ${ageStr} / ${sexStr}   Hospital: ${r.hospital?.name || '—'}   Date: ${formatDate(r.surgery.surgery_date)}`, margin, y);
        y += big ? 14 : 11;
      };

      sortedRows.forEach((r, rowIndex) => {
        const category = categorize(r.surgery.surgery_type);
        const isMajor = category === 'Major';
        const isLastRow = rowIndex === sortedRows.length - 1;

        if (isMajor) {
          // Every major case starts on its own fresh page and gets a
          // generous, complete layout — patient details, investigations,
          // full operative notes, and larger photos.
          if (y > margin + 5) newPage();
          drawCaseHeader(r, true);

          if (r.patient?.diagnosis) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(...NAVY);
            doc.text('Diagnosis', margin, y);
            y += 12;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...MUTED);
            const wrapped = doc.splitTextToSize(r.patient.diagnosis, maxWidth) as string[];
            for (const w of wrapped) { if (y > pageHeight - margin) newPage(); doc.text(w, margin, y); y += 12; }
            y += 4;
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(...NAVY);
          doc.text('Procedure', margin, y);
          y += 12;
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...MUTED);
          doc.text(`${r.surgery.procedure_name || '—'}   |   Anaesthesia: ${r.surgery.anaesthesia_type || '—'}   |   Role: ${r.surgery.role === 'assisted_by_me' ? 'Assisted' : 'Done by me'}`, margin, y);
          y += 18;

          const patientInvestigations = r.patient ? (investigationsByPatient.get(r.patient.id) || []) : [];
          if (patientInvestigations.length > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(...NAVY);
            doc.text('Investigations', margin, y);
            y += 12;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...MUTED);
            for (const inv of patientInvestigations) {
              if (y > pageHeight - margin) newPage();
              const line = `${inv.investigation_name}${inv.investigation_date ? ` (${formatDate(inv.investigation_date)})` : ''}: ${inv.value || '—'}`;
              doc.text(line, margin, y);
              y += 12;
            }
            y += 6;
          }

          if (r.surgery.procedure_notes) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(...NAVY);
            doc.text('Operative Notes', margin, y);
            y += 12;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...MUTED);
            const wrapped = doc.splitTextToSize(r.surgery.procedure_notes, maxWidth) as string[];
            for (const w of wrapped) { if (y > pageHeight - margin) newPage(); doc.text(w, margin, y); y += 12; }
            y += 6;
          }

          drawImageGrid(r.surgery.image_paths || [], 'Intra-operative / Specimen Photos', 130, 3);
          drawImageGrid(r.surgery.consent_image_paths || [], 'Consent Page', 130, 3);

          // Every major case gets its own dedicated page(s) — the next
          // case (of any kind) always starts fresh, unless this was the
          // last case (nothing to reserve a blank page for).
          if (!isLastRow) newPage();
          compactOnPage = 0;
        } else {
          // Minor / Bedside / Endoscopy / Others: compact, up to 2 per page.
          if (compactOnPage >= 2) newPage();
          if (compactOnPage === 1) {
            doc.setDrawColor(...BORDER);
            doc.line(margin, y, pageWidth - margin, y);
            y += 16;
          }
          drawCaseHeader(r, false);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(...MUTED);
          doc.text(`${r.surgery.procedure_name || '—'}   |   ${r.surgery.anaesthesia_type || '—'}   |   ${r.surgery.role === 'assisted_by_me' ? 'Assisted' : 'Done by me'}`, margin, y);
          y += 14;
          if (r.surgery.procedure_notes) {
            const wrapped = (doc.splitTextToSize(r.surgery.procedure_notes, maxWidth) as string[]).slice(0, 3);
            for (const w of wrapped) { doc.text(w, margin, y); y += 11; }
          }
          drawImageGrid(r.surgery.image_paths || [], 'Photos', 70, 5);
          y += 10;
          compactOnPage++;
        }
      });

      // ---- Classes (if included) ----
      if (includeClasses) {
        newPage();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(...NAVY);
        doc.text('Classes / Teaching', margin, y);
        y += 24;

        if (classes.length === 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(...MUTED);
          doc.text('No classes logged.', margin, y);
          y += 16;
        } else {
          classes.forEach((c) => {
            if (y > pageHeight - margin - 60) newPage();
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(...NAVY);
            doc.text(c.topic || 'Untitled class', margin, y);
            y += 14;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...MUTED);
            doc.text(`${formatDate(c.class_date)}  |  ${c.class_type || '—'}  |  ${c.hospital?.name || '—'}  |  To: ${c.audience || '—'}`, margin, y);
            y += 18;
            doc.setDrawColor(...BORDER);
            doc.line(margin, y, pageWidth - margin, y);
            y += 14;
          });
        }
      }

      // ---- Publications (if included) ----
      if (includePublications) {
        newPage();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(...NAVY);
        doc.text('Publications', margin, y);
        y += 24;

        if (publications.length === 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(...MUTED);
          doc.text('No publications logged.', margin, y);
          y += 16;
        } else {
          publications.forEach((p) => {
            if (y > pageHeight - margin - 60) newPage();
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(...NAVY);
            doc.text(p.topic || 'Untitled', margin, y);
            y += 14;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...MUTED);
            const when = `${p.month ? MONTHS[p.month - 1] : ''} ${p.year || ''}`.trim();
            doc.text(`${p.publication_type || '—'}  |  ${p.platform || '—'}  |  ${when || '—'}  |  ${p.author_details || '—'}`, margin, y);
            y += 18;
            doc.setDrawColor(...BORDER);
            doc.line(margin, y, pageWidth - margin, y);
            y += 14;
          });
        }
      }

      addPageNumber();

      const fileName = `logbook${activeFilters.length > 0 ? '_filtered' : ''}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Surgical Logbook</h1>
          <p className="text-slate-500 text-sm mt-0.5">Date-wise case details of all surgeries — printable as a book with filters</p>
        </div>
        <button
          onClick={handleExportPdf}
          disabled={exporting || filtered.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> {exporting ? 'Generating...' : 'Export Logbook (PDF)'}
        </button>
      </div>

      {/* Cover page details */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-medium text-slate-600 mb-3">Cover Page Details (used for the PDF only, not saved)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="log-doctor-name" className="block text-xs font-medium text-slate-500 mb-1">Doctor Name</label>
            <input id="log-doctor-name" name="doctorName" type="text" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="e.g. Dr. Jane Smith" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label htmlFor="log-qualifications" className="block text-xs font-medium text-slate-500 mb-1">Qualifications</label>
            <input id="log-qualifications" name="qualifications" type="text" value={qualifications} onChange={(e) => setQualifications(e.target.value)} placeholder="e.g. MS, MCh" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">Filter Records</span>
          {(monthFilter || yearFilter || hospitalFilter || typeFilter) && (
            <button onClick={clearFilters} className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition">
              <X className="w-3.5 h-3.5" /> Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="log-filter-month" className="block text-xs font-medium text-slate-500 mb-1">Month</label>
            <select id="log-filter-month" name="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="">All months</option>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="log-filter-year" className="block text-xs font-medium text-slate-500 mb-1">Year</label>
            <select id="log-filter-year" name="year" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="">All years</option>
              {availableYears.map((y) => <option key={y} value={y.toString()}>{y}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="log-filter-hospital" className="block text-xs font-medium text-slate-500 mb-1">Hospital</label>
            <select id="log-filter-hospital" name="hospital" value={hospitalFilter} onChange={(e) => setHospitalFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="">All hospitals</option>
              {availableHospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="log-filter-type" className="block text-xs font-medium text-slate-500 mb-1">Surgery Type</label>
            <select id="log-filter-type" name="surgeryType" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="">All types</option>
              {availableTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
            <input
              id="log-include-classes"
              name="includeClasses"
              type="checkbox"
              checked={includeClasses}
              onChange={(e) => setIncludeClasses(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            <GraduationCap className="w-4 h-4 text-violet-500" /> Include Classes in Logbook
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
            <input
              id="log-include-publications"
              name="includePublications"
              type="checkbox"
              checked={includePublications}
              onChange={(e) => setIncludePublications(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <BookOpen className="w-4 h-4 text-sky-500" /> Include Publications in Logbook
          </label>
        </div>
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
            {activeFilters.map((f, i) => (
              <span key={i} className="text-xs bg-sky-50 text-sky-700 px-2.5 py-1 rounded-lg font-medium">{f}</span>
            ))}
          </div>
        )}
      </div>

      {/* Results count */}
      <p className="text-sm text-slate-500">
        Showing <span className="font-semibold text-slate-700">{filtered.length}</span> of {rows.length} surgeries
      </p>

      {/* Logbook entries */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 mb-1">No surgeries match the selected filters.</p>
          <p className="text-sm text-slate-400">Try clearing or adjusting the filters above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const p = r.patient;
            return (
              <div key={r.surgery.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-slate-800">{p?.patient_name || 'Unknown patient'}</span>
                      <span className="text-xs font-mono bg-sky-50 text-sky-600 px-2 py-0.5 rounded">{p?.unique_id || '—'}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${r.surgery.role === 'assisted_by_me' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {r.surgery.role === 'assisted_by_me' ? 'Assisted' : 'Done by me'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-500">
                      <div><span className="text-slate-400">Date:</span> {formatDate(r.surgery.surgery_date)}</div>
                      <div><span className="text-slate-400">Age/Sex:</span> {p?.age != null ? `${p.age}y` : '—'} / {p?.sex || '—'}</div>
                      <div><span className="text-slate-400">Hospital:</span> {r.hospital?.name || '—'}</div>
                      <div><span className="text-slate-400">Type:</span> {r.surgery.surgery_type || '—'}</div>
                    </div>
                    <p className="text-sm font-medium text-slate-700 mt-2">{r.surgery.procedure_name || 'Untitled procedure'}</p>
                    {r.surgery.procedure_notes && (
                      <p className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">{r.surgery.procedure_notes}</p>
                    )}
                  </div>
                </div>
                {(r.surgery.image_paths?.length || r.surgery.consent_image_paths?.length) ? (
                  <div className="mt-3 flex gap-3 flex-wrap">
                    {r.surgery.image_paths && r.surgery.image_paths.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Surgery Images</p>
                        <div className="flex gap-2 flex-wrap">
                          {r.surgery.image_paths.map((path, i) => imageUrls[path] ? (
                            <a key={i} href={imageUrls[path]} target="_blank" rel="noopener noreferrer">
                              <img src={imageUrls[path]} alt={`Surgery ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-slate-200 hover:opacity-80 transition" />
                            </a>
                          ) : null)}
                        </div>
                      </div>
                    )}
                    {r.surgery.consent_image_paths && r.surgery.consent_image_paths.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Consent Page</p>
                        <div className="flex gap-2 flex-wrap">
                          {r.surgery.consent_image_paths.map((path, i) => imageUrls[path] ? (
                            <a key={i} href={imageUrls[path]} target="_blank" rel="noopener noreferrer">
                              <img src={imageUrls[path]} alt={`Consent ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-emerald-200 hover:opacity-80 transition" />
                            </a>
                          ) : null)}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* Classes — shown when included */}
      {includeClasses && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pt-2">
            <GraduationCap className="w-4 h-4 text-violet-500" />
            <h2 className="font-semibold text-slate-700">Classes / Teaching</h2>
          </div>
          {classes.length === 0 ? (
            <p className="text-sm text-slate-400 bg-white rounded-xl border border-slate-200 p-4 text-center">No classes logged yet.</p>
          ) : (
            classes.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-slate-800">{c.topic || 'Untitled class'}</span>
                  {c.class_type && <span className="text-xs font-medium px-2 py-0.5 rounded bg-violet-50 text-violet-600">{c.class_type}</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-500">
                  <div><span className="text-slate-400">Date:</span> {formatDate(c.class_date)}</div>
                  <div><span className="text-slate-400">Hospital:</span> {c.hospital?.name || '—'}</div>
                  <div><span className="text-slate-400">Audience:</span> {c.audience || '—'}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Publications — shown when included */}
      {includePublications && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pt-2">
            <BookOpen className="w-4 h-4 text-sky-500" />
            <h2 className="font-semibold text-slate-700">Publications</h2>
          </div>
          {publications.length === 0 ? (
            <p className="text-sm text-slate-400 bg-white rounded-xl border border-slate-200 p-4 text-center">No publications logged yet.</p>
          ) : (
            publications.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-slate-800">{p.topic || 'Untitled'}</span>
                  {p.publication_type && <span className="text-xs font-medium px-2 py-0.5 rounded bg-sky-50 text-sky-600">{p.publication_type}</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-500">
                  <div><span className="text-slate-400">Authors:</span> {p.author_details || '—'}</div>
                  <div><span className="text-slate-400">Platform:</span> {p.platform || '—'}</div>
                  <div><span className="text-slate-400">When:</span> {p.month ? MONTHS[p.month - 1] : ''} {p.year || '—'}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Patient, Hospital, Surgery } from '@/lib/types';
import { formatDate, getImageUrl } from '@/lib/helpers';
import { Activity, Download, Filter, X, FileText } from 'lucide-react';
import jsPDF from 'jspdf';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface LogbookRow {
  surgery: Surgery;
  patient: Patient | null;
  hospital: Hospital | null;
}

export default function SurgicalLogbook() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LogbookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: surgeries }, { data: patients }, { data: hospitals }] = await Promise.all([
        supabase.from('surgeries').select('*').order('surgery_date', { ascending: false, nullsFirst: false }),
        supabase.from('patients').select('*, hospital:hospitals(*)'),
        supabase.from('hospitals').select('*').order('name'),
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

  const handleExportPdf = () => {
    setExporting(true);
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
      doc.setTextColor(160, 160, 160);
      doc.text(`Page ${page}`, pageWidth / 2, pageHeight - 20, { align: 'center' });
      doc.setTextColor(40, 40, 40);
    };

    // ---- Cover Page ----
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(20, 20, 40);
    doc.text('Surgical Logbook', pageWidth / 2, pageHeight / 2 - 40, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pageWidth / 2, pageHeight / 2, { align: 'center' });
    doc.text(`Total Records: ${filtered.length}`, pageWidth / 2, pageHeight / 2 + 20, { align: 'center' });
    if (activeFilters.length > 0) {
      doc.setFontSize(10);
      const filterText = activeFilters.join('  |  ');
      const wrappedFilters = doc.splitTextToSize(`Filters: ${filterText}`, maxWidth) as string[];
      let fy = pageHeight / 2 + 50;
      for (const w of wrappedFilters) {
        doc.text(w, pageWidth / 2, fy, { align: 'center' });
        fy += 14;
      }
    }
    addPageNumber();
    doc.addPage();
    page++;
    y = margin;

    // ---- Table of Contents ----
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text('Table of Contents', margin, y);
    y += 24;

    // Group by date
    const byDate = new Map<string, LogbookRow[]>();
    for (const r of filtered) {
      const key = r.surgery.surgery_date ? r.surgery.surgery_date.substring(0, 10) : 'No Date';
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(r);
    }
    const sortedDates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(70, 70, 70);
    for (const d of sortedDates) {
      if (y > pageHeight - margin) {
        addPageNumber();
        doc.addPage();
        page++;
        y = margin;
      }
      const label = d === 'No Date' ? 'Undated' : formatDate(d);
      const count = byDate.get(d)!.length;
      doc.text(`${label}  —  ${count} case${count > 1 ? 's' : ''}`, margin, y);
      y += 16;
    }
    addPageNumber();
    doc.addPage();
    page++;
    y = margin;

    // ---- Date-wise Case Details ----
    for (const d of sortedDates) {
      // Date heading
      if (y + 30 > pageHeight - margin) {
        addPageNumber();
        doc.addPage();
        page++;
        y = margin;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(30, 60, 120);
      doc.text(d === 'No Date' ? 'Undated Cases' : formatDate(d), margin, y);
      y += 20;
      doc.setDrawColor(180, 200, 230);
      doc.line(margin, y, pageWidth - margin, y);
      y += 16;

      const rowsForDate = byDate.get(d)!;
      rowsForDate.forEach((r, idx) => {
        const p = r.patient;
        const nameStr = p?.patient_name || 'Unknown';
        const ageStr = p?.age != null ? `${p.age}y` : '—';
        const sexStr = p?.sex || '—';
        const idStr = p?.unique_id || '—';
        const hospStr = r.hospital?.name || '—';
        const procStr = r.surgery.procedure_name || '—';
        const typeStr = r.surgery.surgery_type || '—';
        const roleStr = r.surgery.role === 'assisted_by_me' ? 'Assisted' : 'Done by me';
        const notesStr = r.surgery.procedure_notes || '';
        const imgCount = (r.surgery.image_paths?.length || 0) + (r.surgery.consent_image_paths?.length || 0);

        const blockHeight = 70 + (notesStr ? 24 : 0) + (imgCount > 0 ? 14 : 0);

        if (y + blockHeight > pageHeight - margin) {
          addPageNumber();
          doc.addPage();
          page++;
          y = margin;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(40, 40, 40);
        doc.text(`Case ${idx + 1}: ${nameStr}`, margin, y);
        y += 14;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(70, 70, 70);
        doc.text(`ID: ${idStr}   Age/Sex: ${ageStr} / ${sexStr}   Hospital: ${hospStr}`, margin, y);
        y += 12;
        doc.text(`Procedure: ${procStr}   Type: ${typeStr}   Role: ${roleStr}`, margin, y);
        y += 12;

        if (notesStr) {
          doc.setTextColor(90, 90, 90);
          const wrappedNotes = doc.splitTextToSize(`Notes: ${notesStr}`, maxWidth) as string[];
          for (const w of wrappedNotes) {
            if (y > pageHeight - margin) {
              addPageNumber();
              doc.addPage();
              page++;
              y = margin;
            }
            doc.text(w, margin, y);
            y += 11;
          }
        }

        if (imgCount > 0) {
          doc.setTextColor(130, 130, 130);
          doc.text(`Attachments: ${imgCount} image(s) [${r.surgery.image_paths?.length || 0} surgery, ${r.surgery.consent_image_paths?.length || 0} consent]`, margin, y);
          y += 12;
        }

        y += 6;
        doc.setDrawColor(235, 235, 235);
        doc.line(margin, y, pageWidth - margin, y);
        y += 14;
      });

      y += 8;
    }

    // Final page number on last page
    addPageNumber();

    const fileName = `surgical_logbook${activeFilters.length > 0 ? '_filtered' : ''}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    setExporting(false);
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
            <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="">All months</option>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Year</label>
            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="">All years</option>
              {availableYears.map((y) => <option key={y} value={y.toString()}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Hospital</label>
            <select value={hospitalFilter} onChange={(e) => setHospitalFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="">All hospitals</option>
              {availableHospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Surgery Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="">All types</option>
              {availableTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
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
    </div>
  );
}

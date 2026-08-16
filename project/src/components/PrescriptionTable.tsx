import { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, X } from 'lucide-react';
import { PrescriptionTableData } from '@/lib/types';

export const DEFAULT_PRESCRIPTION: PrescriptionTableData = {
  columns: [
    { key: 'drug_name', label: 'Drug Name' },
    { key: 'dose', label: 'Dose' },
    { key: 'frequency', label: 'Dosage / Frequency' },
    { key: 'days', label: 'No. of Days' },
    { key: 'instructions', label: 'Instructions' },
  ],
  rows: [],
};

function slugify(label: string, existingKeys: string[]): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'column';
  let key = base;
  let i = 2;
  while (existingKeys.includes(key)) key = `${base}_${i++}`;
  return key;
}

interface Props {
  value: PrescriptionTableData;
  onChange: (next: PrescriptionTableData) => void;
}

export default function PrescriptionTable({ value, onChange }: Props) {
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const columns = value?.columns ?? DEFAULT_PRESCRIPTION.columns;
  const rows = value?.rows ?? [];

  const set = (next: Partial<PrescriptionTableData>) => onChange({ columns, rows, ...next });

  const addRow = () => set({ rows: [...rows, {}] });
  const deleteRow = (index: number) => set({ rows: rows.filter((_, i) => i !== index) });

  const moveRow = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    set({ rows: next });
  };

  const updateCell = (index: number, key: string, cellValue: string) => {
    const next = [...rows];
    next[index] = { ...next[index], [key]: cellValue };
    set({ rows: next });
  };

  const addColumn = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newColumnLabel.trim();
    if (!label) return;
    const key = slugify(label, columns.map((c) => c.key));
    set({ columns: [...columns, { key, label }] });
    setNewColumnLabel('');
  };

  const deleteColumn = (key: string) => {
    if (!confirm('Remove this column? Data in it will be lost.')) return;
    set({
      columns: columns.filter((c) => c.key !== key),
      rows: rows.map((r) => {
        const rest = { ...r };
        delete rest[key];
        return rest;
      }),
    });
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-2 py-2 w-10">S.No</th>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-2">
                  <div className="flex items-center gap-1">
                    <span>{c.label}</span>
                    <button type="button" onClick={() => deleteColumn(c.key)} className="text-red-400 hover:text-red-600" title={`Remove ${c.label}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 w-20">Move</th>
              <th className="px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-slate-100 align-top">
                <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} className="px-2 py-1.5">
                    <input
                      value={row[c.key] || ''}
                      onChange={(e) => updateCell(i, c.key, e.target.value)}
                      className="w-full px-2 py-1 rounded border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none text-sm"
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => moveRow(i, -1)} disabled={i === 0} className="text-slate-400 disabled:opacity-30 hover:text-slate-600">
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1} className="text-slate-400 disabled:opacity-30 hover:text-slate-600">
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <button type="button" onClick={() => deleteRow(i)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 3} className="px-2 py-4 text-center text-sm text-slate-400">
                  No drugs added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button type="button" onClick={addRow} className="flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-700 px-2 py-1 rounded-lg hover:bg-sky-50 transition">
          <Plus className="w-4 h-4" /> Add row
        </button>
        <form onSubmit={addColumn} className="flex gap-1">
          <input
            value={newColumnLabel}
            onChange={(e) => setNewColumnLabel(e.target.value)}
            placeholder="New column name"
            className="px-2 py-1 rounded-lg border border-slate-200 text-sm w-36 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
          />
          <button type="submit" className="text-sm font-medium text-slate-600 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 transition">
            + Add column
          </button>
        </form>
      </div>
    </div>
  );
}

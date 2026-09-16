import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { readSheet } from 'read-excel-file/universal';
import api from '../api/client';

const normalize = (s) => String(s ?? '').trim().toLowerCase();

// Reads a filled-out F-LAB-010 Inventory Sheet export: finds the header row
// (wherever it is) by looking for a "Description" cell, then reads rows
// below it until the Description column goes empty.
async function parseImportFile(file) {
  const sheet = await readSheet(file);

  const headerRowIndex = sheet.findIndex((row) =>
    row.some((cell) => normalize(cell) === 'description')
  );
  if (headerRowIndex === -1) {
    throw new Error('Could not find a "Description" column header in this file.');
  }
  const headerRow = sheet[headerRowIndex];
  const colIndex = (name) => headerRow.findIndex((cell) => normalize(cell) === name);

  const descCol = colIndex('description');
  const actualCol = colIndex('actual quantity');
  const remarksCol = colIndex('remarks');

  const imported = [];
  for (let i = headerRowIndex + 1; i < sheet.length; i++) {
    const row = sheet[i];
    const description = row[descCol];
    if (!normalize(description)) break;
    imported.push({
      description: String(description).trim(),
      actual: actualCol === -1 ? null : row[actualCol],
      remarks: remarksCol === -1 ? null : row[remarksCol],
    });
  }
  return imported;
}

export default function InventoryCountDetail() {
  const { id } = useParams();
  const [count, setCount] = useState(null);
  const [rows, setRows] = useState([]);
  const [preparedBy, setPreparedBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [importSummary, setImportSummary] = useState('');
  const fileInputRef = useRef(null);

  function load() {
    api.get(`/inventory-counts/${id}`).then((res) => {
      setCount(res.data);
      setRows(res.data.items.map((it) => ({ ...it, quantity_actual: it.quantity_actual ?? '' })));
      setPreparedBy(res.data.prepared_by);
    });
  }

  useEffect(load, [id]);

  const readOnly = count?.status === 'applied';

  function updateRow(rowId, field, value) {
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)));
  }

  function variance(row) {
    if (row.quantity_actual === '' || row.quantity_actual === null || row.quantity_actual === undefined) return null;
    return Number(row.quantity_actual) - row.quantity_recorded;
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      await api.put(`/inventory-counts/${id}`, {
        prepared_by: preparedBy,
        items: rows.map((r) => ({ id: r.id, quantity_actual: r.quantity_actual, remarks: r.remarks })),
      });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    setError('');
    setImportSummary('');
    try {
      const imported = await parseImportFile(file);
      const byDescription = new Map(imported.map((r) => [normalize(r.description), r]));

      let matched = 0;
      setRows((rs) =>
        rs.map((row) => {
          const found = byDescription.get(normalize(row.description));
          if (!found) return row;
          matched++;
          return {
            ...row,
            quantity_actual: found.actual === null || found.actual === undefined ? row.quantity_actual : found.actual,
            remarks: found.remarks === null || found.remarks === undefined ? row.remarks : String(found.remarks),
          };
        })
      );

      const unmatched = imported.length - matched;
      setImportSummary(
        `Imported ${matched} of ${imported.length} row(s) from the file.` +
          (unmatched > 0 ? ` ${unmatched} row(s) didn't match an item by description and were skipped.` : '')
      );
    } catch (err) {
      setError(err.message || 'Failed to read that file');
    }
  }

  async function handleApply() {
    const unfilled = rows.filter((r) => r.quantity_actual === '' || r.quantity_actual === null);
    if (unfilled.length > 0) {
      if (!confirm(`${unfilled.length} item(s) have no actual quantity entered and will be treated as no change. Continue?`)) {
        return;
      }
    }
    if (!confirm('Apply these variances to stock? This creates adjustment entries on each item\'s stock card and cannot be edited afterward.')) {
      return;
    }
    setError('');
    try {
      await handleSave();
      await api.post(`/inventory-counts/${id}/apply`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to apply adjustments');
    }
  }

  if (!count) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link to="/inventory-counts" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to Inventory Counts
        </Link>
        <div className="space-x-2">
          {!readOnly && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleImportFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg px-4 py-2"
              >
                Import from Excel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg px-4 py-2"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={handleApply}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
              >
                Apply Adjustments to Stock
              </button>
            </>
          )}
          <button
            onClick={() => window.print()}
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Print
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 no-print">{error}</p>}
      {importSummary && <p className="text-sm text-slate-600 no-print">{importSummary}</p>}

      {readOnly && (
        <div className="no-print bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-2 text-sm">
          This count was applied to stock on {count.applied_at?.slice(0, 10)} by {count.applied_by_name}.
        </div>
      )}

      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden print:border-black print:rounded-none">
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4 text-center">INVENTORY SHEET</h2>

          <table className="mb-4 text-sm">
            <tbody>
              <tr>
                <td className="px-1 py-1.5 font-semibold w-32">Laboratory:</td>
                <td className="px-1 py-1.5">{count.laboratory_name}</td>
              </tr>
              <tr>
                <td className="px-1 py-1.5 font-semibold">Prepared by:</td>
                <td className="px-1 py-1.5">
                  {readOnly ? (
                    preparedBy
                  ) : (
                    <input
                      className="border border-slate-300 rounded px-2 py-1 text-sm"
                      value={preparedBy}
                      onChange={(e) => setPreparedBy(e.target.value)}
                    />
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Item No.</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Description</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Unit</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-right">
                  Quantity As per Record
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-right">Actual Quantity</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-right">Variance</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const v = variance(row);
                return (
                  <tr key={row.id}>
                    <td className="border border-slate-300 px-3 py-2">{row.item_no}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.description}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.unit}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right">{row.quantity_recorded}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right">
                      {readOnly ? (
                        row.quantity_actual
                      ) : (
                        <input
                          type="number"
                          className="w-20 border border-slate-300 rounded px-2 py-1 text-sm text-right"
                          value={row.quantity_actual}
                          onChange={(e) => updateRow(row.id, 'quantity_actual', e.target.value)}
                        />
                      )}
                    </td>
                    <td
                      className={`border border-slate-300 px-3 py-2 text-right font-medium ${
                        v > 0 ? 'text-emerald-700' : v < 0 ? 'text-red-700' : ''
                      }`}
                    >
                      {v === null ? '' : v > 0 ? `+${v}` : v}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      {readOnly ? (
                        row.remarks
                      ) : (
                        <input
                          className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                          value={row.remarks || ''}
                          onChange={(e) => updateRow(row.id, 'remarks', e.target.value)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="border border-slate-300 px-3 py-6 text-center text-slate-400">
                    This laboratory has no items to count.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

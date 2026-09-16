import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';

const FIELDS = [
  { key: 'item_name', label: 'Item Name', required: true, guesses: ['description', 'item name', 'item', 'name'] },
  { key: 'unit_of_measure', label: 'Unit of Measure', required: false, guesses: ['unit', 'uom', 'unit of measure'] },
  { key: 'initial_balance', label: 'Quantity / Starting Balance', required: false, guesses: ['quantity', 'qty', 'balance'] },
  { key: 'category', label: 'Category', required: false, guesses: ['category', 'variance', 'type'] },
  { key: 'reorder_level', label: 'Reorder Level', required: false, guesses: ['reorder', 'reorder level'] },
  { key: 'notes', label: 'Notes', required: false, guesses: ['remarks', 'notes', 'remark'] },
];

function splitPasted(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  const delimiter = lines.some((l) => l.includes('\t')) ? '\t' : ',';
  return lines.map((l) => l.split(delimiter).map((c) => c.trim()));
}

function extractNumber(value) {
  const match = String(value ?? '').match(/\d+(\.\d+)?/);
  return match ? Math.round(parseFloat(match[0])) : null;
}

function guessColumn(headers, guesses) {
  const lower = headers.map((h) => h.toLowerCase());
  for (const guess of guesses) {
    const idx = lower.findIndex((h) => h.includes(guess));
    if (idx !== -1) return idx;
  }
  return -1;
}

export default function ImportItems() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialLabId = searchParams.get('laboratory_id') || '';

  const [labs, setLabs] = useState([]);
  const [laboratoryId, setLaboratoryId] = useState(initialLabId);
  const [pasteText, setPasteText] = useState('');
  const [parsed, setParsed] = useState(null); // { headers, dataRows }
  const [mapping, setMapping] = useState({});
  const [defaultUnit, setDefaultUnit] = useState('pcs');
  const [previewRows, setPreviewRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null); // { created, skipped: [{name, error}] }
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/laboratories', { params: { status: 'approved' } }).then((res) => {
      setLabs(res.data);
      if (!laboratoryId && res.data.length === 1) setLaboratoryId(String(res.data[0].id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleParse() {
    setError('');
    setResults(null);
    const rows = splitPasted(pasteText);
    if (rows.length < 2) {
      setError('Paste at least a header row and one data row.');
      return;
    }
    const headers = rows[0];
    const dataRows = rows.slice(1);
    setParsed({ headers, dataRows });

    const guessedMapping = {};
    for (const field of FIELDS) {
      const idx = guessColumn(headers, field.guesses);
      guessedMapping[field.key] = idx;
    }
    setMapping(guessedMapping);
  }

  function buildPreview(currentMapping) {
    if (!parsed) return [];
    return parsed.dataRows.map((row) => {
      const get = (key) => {
        const idx = currentMapping[key];
        return idx === -1 || idx === undefined ? '' : row[idx] ?? '';
      };
      const qtyRaw = get('initial_balance');
      return {
        item_name: get('item_name'),
        unit_of_measure: get('unit_of_measure') || defaultUnit,
        initial_balance: qtyRaw === '' ? 0 : extractNumber(qtyRaw) ?? 0,
        category: get('category'),
        reorder_level: get('reorder_level') === '' ? 0 : extractNumber(get('reorder_level')) ?? 0,
        notes: get('notes'),
        _qtyUnparsed: qtyRaw !== '' && extractNumber(qtyRaw) === null,
      };
    });
  }

  useEffect(() => {
    if (parsed) setPreviewRows(buildPreview(mapping));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, mapping, defaultUnit]);

  function updateMapping(field, value) {
    setMapping((m) => ({ ...m, [field]: value === '' ? -1 : Number(value) }));
  }

  function updatePreviewRow(index, field, value) {
    setPreviewRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function removePreviewRow(index) {
    setPreviewRows((rows) => rows.filter((_, i) => i !== index));
  }

  const canImport = useMemo(
    () => laboratoryId && previewRows.length > 0 && previewRows.every((r) => r.item_name.trim() && r.unit_of_measure.trim()),
    [laboratoryId, previewRows]
  );

  async function handleImport() {
    setImporting(true);
    setError('');
    const created = [];
    const skipped = [];
    for (const row of previewRows) {
      try {
        await api.post('/items', {
          laboratory_id: laboratoryId,
          item_name: row.item_name.trim(),
          unit_of_measure: row.unit_of_measure.trim(),
          initial_balance: row.initial_balance,
          category: row.category?.trim() || null,
          reorder_level: row.reorder_level,
          notes: row.notes?.trim() || null,
        });
        created.push(row.item_name);
      } catch (err) {
        skipped.push({ name: row.item_name, error: err.response?.data?.error || 'Failed' });
      }
    }
    setResults({ created, skipped });
    setImporting(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Import Items</h1>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 max-w-3xl">
        <div>
          <label className="block text-sm text-slate-600 mb-1">Laboratory</label>
          <select
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={laboratoryId}
            onChange={(e) => setLaboratoryId(e.target.value)}
          >
            <option value="" disabled>
              Select laboratory
            </option>
            {labs.map((lab) => (
              <option key={lab.id} value={lab.id}>
                {lab.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-slate-600 mb-1">
            Paste from Excel/Sheets (include the header row)
          </label>
          <textarea
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono h-32"
            placeholder={'Description\tUnit\tQuantity\tRemarks\nBattery Charger\tPcs\t11\tAll working'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Default unit (used if no Unit column)</label>
            <input
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-32"
              value={defaultUnit}
              onChange={(e) => setDefaultUnit(e.target.value)}
            />
          </div>
          <button
            onClick={handleParse}
            className="mt-5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Parse Pasted Data
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {parsed && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 max-w-5xl">
          <h2 className="font-semibold text-slate-700">Map Columns</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <label className="block text-sm text-slate-600 mb-1">
                  {field.label}
                  {field.required && <span className="text-red-500"> *</span>}
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={mapping[field.key] ?? -1}
                  onChange={(e) => updateMapping(field.key, e.target.value)}
                >
                  <option value={-1}>— none —</option>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {previewRows.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden max-w-5xl">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">
              Preview ({previewRows.length} item{previewRows.length === 1 ? '' : 's'})
            </h2>
            <button
              onClick={handleImport}
              disabled={!canImport || importing}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
            >
              {importing ? 'Importing…' : `Import ${previewRows.length} Item(s)`}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Item Name</th>
                  <th className="px-3 py-2 text-left font-medium">Unit</th>
                  <th className="px-3 py-2 text-left font-medium">Qty</th>
                  <th className="px-3 py-2 text-left font-medium">Category</th>
                  <th className="px-3 py-2 text-left font-medium">Reorder</th>
                  <th className="px-3 py-2 text-left font-medium">Notes</th>
                  <th className="px-3 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewRows.map((row, i) => (
                  <tr key={i} className={row._qtyUnparsed ? 'bg-amber-50' : ''}>
                    <td className="px-3 py-1.5">
                      <input
                        className="w-full border border-slate-200 rounded px-2 py-1"
                        value={row.item_name}
                        onChange={(e) => updatePreviewRow(i, 'item_name', e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className="w-20 border border-slate-200 rounded px-2 py-1"
                        value={row.unit_of_measure}
                        onChange={(e) => updatePreviewRow(i, 'unit_of_measure', e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        className="w-16 border border-slate-200 rounded px-2 py-1"
                        value={row.initial_balance}
                        onChange={(e) => updatePreviewRow(i, 'initial_balance', Number(e.target.value))}
                        title={row._qtyUnparsed ? "Couldn't read a number from the pasted quantity — check this" : ''}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className="w-28 border border-slate-200 rounded px-2 py-1"
                        value={row.category}
                        onChange={(e) => updatePreviewRow(i, 'category', e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        className="w-16 border border-slate-200 rounded px-2 py-1"
                        value={row.reorder_level}
                        onChange={(e) => updatePreviewRow(i, 'reorder_level', Number(e.target.value))}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className="w-full border border-slate-200 rounded px-2 py-1"
                        value={row.notes}
                        onChange={(e) => updatePreviewRow(i, 'notes', e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button onClick={() => removePreviewRow(i)} className="text-red-600 hover:text-red-800 text-xs">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-slate-400">
            Rows highlighted amber had a quantity that couldn't be read as a plain number (e.g. "2 pieces Blue / 2
            pieces White") — the value shown is what we could extract; adjust if needed.
          </p>
        </div>
      )}

      {results && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-3xl space-y-2">
          <p className="text-sm text-emerald-700 font-medium">Created {results.created.length} item(s).</p>
          {results.skipped.length > 0 && (
            <div className="text-sm text-red-600">
              <p className="font-medium">Skipped {results.skipped.length}:</p>
              <ul className="list-disc list-inside">
                {results.skipped.map((s, i) => (
                  <li key={i}>
                    {s.name}: {s.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            onClick={() => navigate(`/items?laboratory_id=${laboratoryId}`)}
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Go to Items
          </button>
        </div>
      )}
    </div>
  );
}

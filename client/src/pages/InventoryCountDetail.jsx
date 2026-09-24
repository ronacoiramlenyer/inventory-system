import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { readSheet } from 'read-excel-file/universal';
import api from '../api/client';
import { useConfirm } from '../context/ConfirmContext';
import ProgressBar, { useProgress } from '../components/ProgressBar';
import LabFormTabs from '../components/LabFormTabs';
import { PrintHeaderRow, PrintTitleRow, PrintFooter } from '../components/PrintHeaderFooter';
import { CLOSE_CONFIRMATION, StatusChip } from '../utils/inventoryStatus.jsx';
import PrintPages from '../components/PrintPages';

const normalize = (s) => String(s ?? '').trim().toLowerCase();
let tempKeySeq = 0;
const nextTempKey = () => `new-${++tempKeySeq}`;

// The Inventory Sheet is the only place a brand-new item can be created --
// the standalone "+ Add Item" (Stock Cards) and "+ Add Equipment" (EMR)
// forms were removed so every item, whatever its category, has to pass
// through here first. A row that becomes Equipment shows up on the EMR
// picker automatically since it's the same `items` row filtered by
// category -- no separate sync needed.
const CATEGORY_OPTIONS = ['Equipment', 'Tools & Materials', 'Consumables'];

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
  const unitCol = colIndex('unit');
  const actualCol = colIndex('actual quantity');
  const remarksCol = colIndex('remarks');

  const imported = [];
  for (let i = headerRowIndex + 1; i < sheet.length; i++) {
    const row = sheet[i];
    const description = row[descCol];
    if (!normalize(description)) break;
    imported.push({
      description: String(description).trim(),
      unit: unitCol === -1 ? null : row[unitCol],
      actual: actualCol === -1 ? null : row[actualCol],
      remarks: remarksCol === -1 ? null : row[remarksCol],
    });
  }
  return imported;
}

const PRINT_ROWS_PER_PAGE = 10;

export default function InventoryCountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirmDialog = useConfirm();
  const { progress, label: progressLabel, start, advance, finish, stop } = useProgress();
  const [count, setCount] = useState(null);
  const [rows, setRows] = useState([]);
  const [preparedBy, setPreparedBy] = useState('');
  const [defaultUnit, setDefaultUnit] = useState('pcs');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [closing, setClosing] = useState(false);
  const [inventoryDate, setInventoryDate] = useState('');
  const [error, setError] = useState('');
  const [importSummary, setImportSummary] = useState('');
  const [bulkCategory, setBulkCategory] = useState(CATEGORY_OPTIONS[0]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const fileInputRef = useRef(null);

  function load() {
    api.get(`/inventory-counts/${id}`).then((res) => {
      setCount(res.data);
      setRows(res.data.items.map((it) => ({ ...it, quantity_actual: it.quantity_actual ?? '' })));
      setPreparedBy(res.data.prepared_by);
      setInventoryDate(res.data.inventory_date || '');
    });
  }

  useEffect(load, [id]);

  const status = count?.status;
  const readOnly = status === 'applied' || status === 'closed';
  // Before the cutoff, "Quantity as per Record" is still tracking the Stock
  // Card, so the sheet is open to counting; after it, only remarks and
  // corrections to the actual counts.
  const beforeCutoff = status === 'open' || status === 'counting';
  const afterCutoff = status === 'for_reconciliation' || status === 'ready_to_close';
  const blockers = count?.close_blockers || [];

  // Anything that resolves to an item can be classified: a new row (the save
  // route reads `category` when it creates the item) or a saved row still
  // linked to one (the route retags that item). A saved row whose item was
  // deleted has nothing to tag, so it's left out.
  const canCategorise = (r) => !r.id || !!r.item_id;
  const selectableKeys = rows.filter(canCategorise).map((r) => r.id ?? r._key);
  const selectedCount = selectableKeys.filter((k) => selectedRows.has(k)).length;
  const allSelected = selectableKeys.length > 0 && selectedCount === selectableKeys.length;

  function updateRow(key, field, value) {
    setRows((rs) => rs.map((r) => ((r.id ?? r._key) === key ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((rs) => [
      ...rs,
      {
        _key: nextTempKey(),
        id: null,
        item_no: rs.length + 1,
        description: '',
        category: '',
        unit: defaultUnit,
        quantity_recorded: 0,
        quantity_actual: '',
        remarks: '',
        created_new_item: 0,
      },
    ]);
  }

  function removeUnsavedRow(key) {
    setRows((rs) => rs.filter((r) => (r.id ?? r._key) !== key));
  }

  function toggleRowSelection(key) {
    setSelectedRows((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedRows(allSelected ? new Set() : new Set(selectableKeys));
  }

  function applyBulkCategory() {
    setRows((rs) =>
      rs.map((r) => {
        const key = r.id ?? r._key;
        return selectedRows.has(key) ? { ...r, category: bulkCategory } : r;
      })
    );
    setSelectedRows(new Set());
  }

  async function removeSavedRow(rowId) {
    if (!(await confirmDialog('Remove this item? Since it was added on this sheet, it will be deleted entirely.'))) return;
    try {
      await api.delete(`/inventory-counts/${id}/items/${rowId}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove that row');
    }
  }

  function variance(row) {
    if (row.quantity_actual === '' || row.quantity_actual === null || row.quantity_actual === undefined) return null;
    return Number(row.quantity_actual) - row.quantity_recorded;
  }

  // Returns whether the save actually succeeded, so callers like
  // handleApply can tell a real failure apart from a normal completion
  // instead of barreling ahead regardless.
  async function handleSave({ withProgress = true } = {}) {
    setError('');
    const missingCategory = rows.some((r) => !r.id && r.description?.trim() && !r.category);
    if (missingCategory) {
      setError('Tick the new rows that still show "No category" and use Assign to set one before saving.');
      return false;
    }
    setSaving(true);
    if (withProgress) start('Saving changes…');
    try {
      const { data } = await api.put(`/inventory-counts/${id}`, {
        prepared_by: preparedBy,
        inventory_date: inventoryDate || undefined,
        items: rows.map((r) => ({
          id: r.id || undefined,
          description: r.description,
          unit: r.unit,
          quantity_actual: r.quantity_actual,
          remarks: r.remarks,
          category: r.category,
        })),
      });
      if (data.errors?.length) {
        setError(data.errors.join(' '));
        if (withProgress) stop();
        return false;
      }
      load();
      setImportSummary('');
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      if (withProgress) finish();
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
      if (withProgress) stop();
      return false;
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

      let matched = 0;
      let added = 0;
      setRows((rs) => {
        const existingKeys = new Set(rs.map((r) => normalize(r.description)));
        const next = rs.map((row) => {
          const found = imported.find((r) => normalize(r.description) === normalize(row.description));
          if (!found) return row;
          matched++;
          return {
            ...row,
            quantity_actual: found.actual === null || found.actual === undefined ? row.quantity_actual : found.actual,
            remarks: found.remarks === null || found.remarks === undefined ? row.remarks : String(found.remarks),
          };
        });
        for (const found of imported) {
          if (existingKeys.has(normalize(found.description))) continue;
          added++;
          next.push({
            _key: nextTempKey(),
            id: null,
            item_no: next.length + 1,
            description: found.description,
            category: '',
            unit: found.unit ? String(found.unit).trim() : defaultUnit,
            quantity_recorded: 0,
            quantity_actual: found.actual ?? '',
            remarks: found.remarks ? String(found.remarks) : '',
            created_new_item: 0,
          });
        }
        return next;
      });

      setImportSummary(
        added > 0
          ? `${matched} row(s) matched an existing item and were updated. ${added} new row(s) were added for items not on this sheet yet — pick a category for each, then click the highlighted Save button.`
          : `${matched} row(s) matched an existing item and were updated — review them below, then click the highlighted Save button.`
      );
    } catch (err) {
      setError(err.message || 'Failed to read that file');
    }
  }

  // Sets the inventory cutoff. Everything up to now has had its recorded
  // quantity tracking the Stock Card live; from here those numbers are the
  // ones the count is reconciled and signed against.
  async function handleCutoff() {
    const ok = await confirmDialog(
      'Set the inventory cutoff? "Quantity as per Record" stops following the Stock Card and freezes at ' +
        'the balances this count was taken against. New receipts and issuances still go on the Stock Card, ' +
        'but they land in the next period.',
      { confirmLabel: 'Set cutoff' }
    );
    if (!ok) return;
    setError('');
    setClosing(true);
    start('Saving changes…');
    try {
      if (!(await handleSave({ withProgress: false }))) return stop();
      advance('Setting the cutoff…');
      await api.post(`/inventory-counts/${id}/cutoff`);
      load();
      finish();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set the cutoff');
      stop();
    } finally {
      setClosing(false);
    }
  }

  async function handleReopenCounting() {
    const ok = await confirmDialog(
      'Reopen this sheet for counting? The cutoff is removed and "Quantity as per Record" goes back to ' +
        'following the Stock Card. Actual quantities already entered are kept.',
      { confirmLabel: 'Reopen counting' }
    );
    if (!ok) return;
    setError('');
    try {
      await api.post(`/inventory-counts/${id}/reopen-counting`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reopen counting');
    }
  }

  // Close Inventory. One controlled operation on the server: archive the
  // sheet, close every Stock Card period, open the next one at the counted
  // quantities, and start the laboratory's next inventory period.
  async function handleClose() {
    const ok = await confirmDialog(CLOSE_CONFIRMATION, { confirmLabel: 'Close inventory period' });
    if (!ok) return;
    setError('');
    setClosing(true);
    start('Saving changes…');
    try {
      if (!(await handleSave({ withProgress: false }))) return stop();
      advance('Closing the inventory period…');
      const { data } = await api.post(`/inventory-counts/${id}/close`, { confirm: true });
      finish();
      if (data.archive?.id) {
        navigate(`/inventory-archive/${data.archive.id}`);
      } else {
        load();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to close the inventory period');
      load();
      stop();
    } finally {
      setClosing(false);
    }
  }

  if (!count) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to Laboratories
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
                disabled={saving || closing}
                className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-sm font-medium rounded-lg px-4 py-2"
              >
                Import from Excel
              </button>
              <button
                onClick={addRow}
                disabled={saving || closing}
                className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-sm font-medium rounded-lg px-4 py-2"
              >
                + Add Row
              </button>
              <button
                onClick={handleSave}
                disabled={saving || closing}
                className={
                  importSummary && !saving
                    ? 'bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 animate-bounce ring-4 ring-amber-300'
                    : 'bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-sm font-medium rounded-lg px-4 py-2'
                }
              >
                {saving ? 'Saving…' : savedFlash ? 'Saved ✓' : 'Save'}
              </button>
              {beforeCutoff && (
                <button
                  onClick={handleCutoff}
                  disabled={saving || closing}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
                >
                  Set Cutoff &amp; Reconcile
                </button>
              )}
              {afterCutoff && (
                <>
                  <button
                    onClick={handleReopenCounting}
                    disabled={saving || closing}
                    className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-sm font-medium rounded-lg px-4 py-2"
                  >
                    Reopen Counting
                  </button>
                  <button
                    onClick={handleClose}
                    disabled={saving || closing || blockers.length > 0}
                    title={blockers.length ? blockers.join(' ') : undefined}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
                  >
                    {closing ? 'Closing…' : 'Close Inventory'}
                  </button>
                </>
              )}
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

      <LabFormTabs laboratoryId={count.laboratory_id} active="inventory-sheet" />

      {/* The inventory period this sheet belongs to. The reference number is
          the thread an auditor pulls: the same number is written into every
          Stock Card annotation this period's closing produces, and onto the
          archived copy of the form. */}
      <div className="no-print bg-white border border-slate-200 rounded-xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Inventory Ref.</div>
            <div className="font-mono font-semibold text-slate-800">{count.reference_no || '—'}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Period</div>
            <div className="font-medium text-slate-700">{count.period_label || '—'}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Inventory Date</div>
            {readOnly ? (
              <div className="font-medium text-slate-700">{count.inventory_date || '—'}</div>
            ) : (
              <input
                type="date"
                value={inventoryDate}
                onChange={(e) => setInventoryDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1 text-sm"
              />
            )}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Status</div>
            <StatusChip status={status} />
          </div>
          {count.archive_id && (
            <Link
              to={`/inventory-archive/${count.archive_id}`}
              className="text-sm text-emerald-700 hover:underline font-medium"
            >
              View archived copy →
            </Link>
          )}
        </div>

        {beforeCutoff && (
          <p className="text-xs text-slate-500 mt-3">
            Quantity as per Record follows the Stock Card while counting, so anything received or issued
            mid-count is reflected. Set the cutoff when the physical count is done to freeze it.
          </p>
        )}
        {afterCutoff && blockers.length === 0 && (
          <p className="text-xs text-emerald-700 mt-3">
            Every item is counted and every variance explained. This period is ready to close.
          </p>
        )}
        {afterCutoff && blockers.length > 0 && (
          <div className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="font-semibold mb-1">Before this period can be closed:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}
        {status === 'closed' && (
          <p className="text-xs text-slate-500 mt-3">
            Closed {count.closed_at?.slice(0, 10)} by {count.closed_by_name}. This sheet is read-only; the
            laboratory's next inventory period is already open on the Inventory Sheet tab.
          </p>
        )}
        {status === 'applied' && (
          <p className="text-xs text-slate-500 mt-3">
            This sheet was finished under the older Apply action, before inventory periods existed. It stays
            readable as-is and is not part of the archive.
          </p>
        )}
      </div>

      <ProgressBar progress={progress} label={progressLabel} />

      {error && <p className="text-sm text-red-600 no-print">{error}</p>}
      {importSummary && <p className="text-sm text-slate-600 no-print">{importSummary}</p>}

      {selectedCount > 0 && (
        <div className="sticky top-0 z-10 no-print bg-slate-800 text-white rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
          <span className="font-medium">{selectedCount} selected</span>
          <select
            className="border border-slate-600 bg-slate-700 rounded px-2 py-1 text-sm"
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={applyBulkCategory}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg px-4 py-1"
          >
            Assign {bulkCategory}
          </button>
          <button
            onClick={() => setSelectedRows(new Set())}
            className="text-slate-300 hover:text-white underline"
          >
            Clear
          </button>
        </div>
      )}

      {readOnly && (
        <div className="no-print bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-2 text-sm">
          This count was applied to stock on {count.applied_at?.slice(0, 10)} by {count.applied_by_name}.
        </div>
      )}

      {!readOnly && rows.length === 0 && (
        <div className="no-print bg-slate-50 border border-slate-200 text-slate-600 rounded-lg px-4 py-3 text-sm">
          This laboratory doesn't have any items yet. Click <strong>+ Add Row</strong> to start listing what's in the
          lab, or <strong>Import from Excel</strong> to bring in a filled-out sheet.
        </div>
      )}

      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden print:border-none print:rounded-none">
        <div className="p-6 print:hidden">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Inventory Sheet</h2>

          {/* The lab/prepared-by info lives in this table's own <thead>,
              alongside the seal/page-label row and the column headers, so
              all of it repeats together at the top of every physical page
              this table breaks across -- keeping it in a separate table
              before this one meant the seal only ever rendered wherever
              this table happened to start in the page flow (i.e. after the
              info block, mid-page), not at the actual top of the page. */}
          <table className="w-full text-sm border-collapse">
            <thead>
              {/* A single full-width cell with an internal flex row, rather
                  than splitting label/value across colSpans that line up
                  with the data columns below -- the Description column is
                  much wider than Item No., so a colSpan-2 label cell ended
                  up stretched across both, leaving a large gap before the
                  value started in column 3. */}
              <tr>
                <td colSpan={7} className="px-1 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold w-32 shrink-0">Laboratory:</span>
                    <span>{count.laboratory_name}</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td colSpan={7} className="px-1 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold w-32 shrink-0">Prepared by:</span>
                    {readOnly ? (
                      <span>{preparedBy}</span>
                    ) : (
                      <input
                        className="border border-slate-300 rounded px-2 py-1 text-sm"
                        value={preparedBy}
                        onChange={(e) => setPreparedBy(e.target.value)}
                      />
                    )}
                  </div>
                </td>
              </tr>
              <tr className="bg-slate-100">
                {!readOnly && selectableKeys.length > 0 && (
                  <th className="border border-slate-300 px-3 py-2 no-print w-10">
                    <input
                      type="checkbox"
                      title="Select all rows"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedCount > 0 && !allSelected;
                      }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Item No.</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Description</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Unit</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-right">
                  Quantity As per Record
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-right">Actual Quantity</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-right">Variance</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Remarks</th>
                {!readOnly && <th className="border border-slate-300 px-3 py-2 no-print w-16"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const v = variance(row);
                const key = row.id ?? row._key;
                const isNew = !row.id; // not yet saved to the server
                const canRemove = !readOnly && (isNew || !!row.created_new_item);
                return (
                  <tr key={key} className={isNew ? 'bg-amber-50/50' : ''}>
                    {!readOnly && selectableKeys.length > 0 && (
                      <td className="border border-slate-300 px-3 py-2 no-print w-10">
                        {canCategorise(row) && (
                          <input
                            type="checkbox"
                            checked={selectedRows.has(key)}
                            onChange={() => toggleRowSelection(key)}
                          />
                        )}
                      </td>
                    )}
                    <td className="border border-slate-300 px-3 py-2">{row.item_no}</td>
                    <td className="border border-slate-300 px-3 py-2">
                      {isNew ? (
                        <div className="space-y-1">
                          <input
                            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                            placeholder="Item name"
                            value={row.description}
                            onChange={(e) => updateRow(key, 'description', e.target.value)}
                          />
                          {row.category ? (
                            <span className="inline-block rounded bg-slate-100 text-slate-700 text-xs px-2 py-0.5">
                              {row.category}
                            </span>
                          ) : (
                            <span className="inline-block rounded bg-amber-100 text-amber-800 text-xs px-2 py-0.5">
                              No category — tick this row and use Assign
                            </span>
                          )}
                          {row.category === 'Equipment' && (
                            <p className="text-xs text-slate-500">
                              Serial numbers are recorded per unit on F-LAB-001, once this row is saved.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="no-print space-y-1">
                          <Link to={`/items/${row.item_id}`} className="text-emerald-700 hover:underline block">
                            {row.description}
                          </Link>
                          {row.item_id &&
                            (row.category ? (
                              <span className="inline-block rounded bg-slate-100 text-slate-700 text-xs px-2 py-0.5">
                                {row.category}
                              </span>
                            ) : (
                              <span className="inline-block rounded bg-amber-100 text-amber-800 text-xs px-2 py-0.5">
                                No category — tick this row and use Assign
                              </span>
                            ))}
                        </div>
                      )}
                      {!isNew && <span className="hidden print:inline">{row.description}</span>}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      {isNew ? (
                        <input
                          className="w-20 border border-slate-300 rounded px-2 py-1 text-sm"
                          value={row.unit}
                          onChange={(e) => updateRow(key, 'unit', e.target.value)}
                        />
                      ) : (
                        row.unit
                      )}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right">{row.quantity_recorded}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right">
                      {readOnly ? (
                        row.quantity_actual
                      ) : (
                        <input
                          type="number"
                          className="w-20 border border-slate-300 rounded px-2 py-1 text-sm text-right"
                          value={row.quantity_actual}
                          onChange={(e) => updateRow(key, 'quantity_actual', e.target.value)}
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
                          onChange={(e) => updateRow(key, 'remarks', e.target.value)}
                        />
                      )}
                    </td>
                    {!readOnly && (
                      <td className="border border-slate-300 px-3 py-2 no-print text-center">
                        {canRemove && (
                          <button
                            onClick={() => (isNew ? removeUnsavedRow(key) : removeSavedRow(row.id))}
                            className="text-slate-400 hover:text-red-600 text-xs underline"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 7 : 8} className="border border-slate-300 px-3 py-6 text-center text-slate-400">
                    No items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

        </div>

        {/* One <table> per physical page so each can carry its own page
            number; PrintPages measures the rows to decide where those
            pages end. */}
        <PrintPages
          rows={rows}
          landscape
          minRows={PRINT_ROWS_PER_PAGE}
          footer={<PrintFooter code="F-LAB-010" date="04-01-25" />}
        >
          {(pageRows, pageIndex, pageCount, startIndex) => (
            <table className="print-page w-full text-xs border-collapse table-fixed">
              <colgroup>
                <col className="w-[8%]" />
                <col className="w-[32%]" />
                <col className="w-[9%]" />
                <col className="w-[13%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <PrintHeaderRow pageLabel={`Page ${pageIndex + 1} of ${pageCount}`} colSpan={7} />
                <PrintTitleRow title="Inventory Sheet" colSpan={7} />
                <tr>
                  <td colSpan={7} className="px-1 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-32 shrink-0">Laboratory:</span>
                      <span>{count.laboratory_name}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={7} className="px-1 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-32 shrink-0">Prepared by:</span>
                      <span>{preparedBy}</span>
                    </div>
                  </td>
                </tr>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Item No.</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Description</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Unit</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-right break-words">
                    Quantity As per Record
                  </th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-right break-words">
                    Actual Quantity
                  </th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-right break-words">Variance</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => {
                  const v = variance(row);
                  return (
                    <tr key={row.id ?? row._key}>
                      <td className="border border-slate-300 px-3 py-2">
                        {row.__blank ? '' : startIndex + i}
                      </td>
                      <td className="border border-slate-300 px-3 py-2">{row.description}</td>
                      <td className="border border-slate-300 px-3 py-2">{row.unit}</td>
                      <td className="border border-slate-300 px-3 py-2 text-right">
                        {row.__blank ? '' : row.quantity_recorded}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right">{row.quantity_actual}</td>
                      <td className="border border-slate-300 px-3 py-2 text-right">{v === null ? '' : v}</td>
                      <td className="border border-slate-300 px-3 py-2">{row.remarks}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </PrintPages>
      </div>
    </div>
  );
}

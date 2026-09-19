import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import LabFormTabs from '../components/LabFormTabs';
import { PrintHeaderRow, PrintTitleRow, PrintFooter, estimatePageLabel } from '../components/PrintHeaderFooter';
import { padRows } from '../utils/padRows';

// A printed page realistically fits ~10 rows of this table once the
// browser's own print margins/header/footer are accounted for.
const MIN_ROWS = 10;

const emptyForm = {
  entry_date: new Date().toISOString().slice(0, 10),
  in_qty: '',
  out_qty: '',
  remarks: '',
  expiry_date: '',
  invoice_no: '',
  handled_by: '',
};

const CATEGORIES = ['Supplies', 'Materials', 'Chemicals', 'Glassware', 'Consumables', 'Other'];

function emptyEditForm(item) {
  return {
    item_name: item.item_name,
    category: item.category || '',
    unit_of_measure: item.unit_of_measure,
    reorder_level: item.reorder_level,
    notes: item.notes || '',
  };
}

export default function StockCard() {
  const { id } = useParams();
  const { user } = useAuth();
  const confirmDialog = useConfirm();
  const navigate = useNavigate();
  const [card, setCard] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [showCorrectForm, setShowCorrectForm] = useState(false);
  const [correctQty, setCorrectQty] = useState('');
  const [correctRemarks, setCorrectRemarks] = useState('');
  const [error, setError] = useState('');

  function load() {
    api.get(`/items/${id}/stock-card`).then((res) => setCard(res.data));
  }

  useEffect(load, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/items/${id}/transactions`, form);
      setShowForm(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save entry');
    }
  }

  function startEditItem() {
    setEditForm(emptyEditForm(card.item));
    setShowEditForm(true);
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.put(`/items/${id}`, editForm);
      setShowEditForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update item');
    }
  }

  function startCorrectBalance() {
    setCorrectQty(String(card.current_balance));
    setCorrectRemarks('');
    setShowCorrectForm(true);
  }

  async function handleCorrectSubmit(e) {
    e.preventDefault();
    setError('');
    const target = Number(correctQty);
    if (Number.isNaN(target)) {
      setError('Enter a valid quantity');
      return;
    }
    const diff = target - card.current_balance;
    if (diff === 0) {
      setShowCorrectForm(false);
      return;
    }
    try {
      await api.post(`/items/${id}/transactions`, {
        entry_date: new Date().toISOString().slice(0, 10),
        in_qty: diff > 0 ? diff : 0,
        out_qty: diff < 0 ? -diff : 0,
        remarks: correctRemarks.trim() || 'Correction to match physical/manual count',
        handled_by: user.full_name,
      });
      setShowCorrectForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to correct balance');
    }
  }

  async function addYearEndMarker() {
    const label = prompt('Label for this divider row (e.g. "Year-end inventory")', 'Year-end inventory');
    if (label === null) return;
    await api.post(`/items/${id}/transactions`, {
      entry_date: new Date().toISOString().slice(0, 10),
      is_period_marker: true,
      remarks: label,
    });
    load();
  }

  async function handleDeleteEntry(entryId) {
    if (!(await confirmDialog('Delete this entry?'))) return;
    await api.delete(`/transactions/${entryId}`);
    load();
  }

  async function handleDeleteItem() {
    if (
      !(await confirmDialog(`Delete "${card.item.item_name}" and its entire stock card history? This cannot be undone.`))
    )
      return;
    await api.delete(`/items/${id}`);
    navigate(`/laboratories/${card.item.laboratory_id}/stock-cards`);
  }

  if (!card) return <p className="text-slate-500">Loading…</p>;

  const { item, entries } = card;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link
          to={`/laboratories/${item.laboratory_id}/stock-cards`}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Back to {item.laboratory_name}
        </Link>
        <div className="space-x-2">
          {user.role === 'admin' && (
            <>
              <button
                onClick={startEditItem}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg px-4 py-2"
              >
                Edit Item
              </button>
              <button
                onClick={startCorrectBalance}
                className="bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-medium rounded-lg px-4 py-2"
              >
                Correct Balance
              </button>
              <button
                onClick={handleDeleteItem}
                className="bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium rounded-lg px-4 py-2"
              >
                Delete Item
              </button>
            </>
          )}
          <button
            onClick={addYearEndMarker}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg px-4 py-2"
          >
            + Divider Row
          </button>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            + Add Entry
          </button>
          <button
            onClick={() => window.print()}
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Print
          </button>
        </div>
      </div>

      <LabFormTabs laboratoryId={item.laboratory_id} active="stock-cards" />

      {error && <p className="text-sm text-red-600 no-print">{error}</p>}

      {showEditForm && (
        <form
          onSubmit={handleEditSubmit}
          className="no-print bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <div className="col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Item Name</label>
            <input
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={editForm.item_name}
              onChange={(e) => setEditForm({ ...editForm, item_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Category</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={editForm.category}
              onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
            >
              <option value="">—</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Unit of Measure</label>
            <input
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={editForm.unit_of_measure}
              onChange={(e) => setEditForm({ ...editForm, unit_of_measure: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Reorder Level</label>
            <input
              type="number"
              min="0"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={editForm.reorder_level}
              onChange={(e) => setEditForm({ ...editForm, reorder_level: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Notes</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
            />
          </div>
          <div className="col-span-full flex gap-2">
            <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2">
              Save Changes
            </button>
            <button
              type="button"
              onClick={() => setShowEditForm(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {showCorrectForm && (
        <form
          onSubmit={handleCorrectSubmit}
          className="no-print bg-white border border-amber-200 rounded-xl p-4 space-y-3"
        >
          <p className="text-sm text-slate-600">
            Current recorded balance: <span className="font-semibold">{card.current_balance}</span>{' '}
            {item.unit_of_measure}. Enter the actual counted quantity to record a correction entry that brings the
            balance in line with your hardcopy/manual count.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Actual Quantity</label>
              <input
                type="number"
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={correctQty}
                onChange={(e) => setCorrectQty(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-slate-600 mb-1">Remarks</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={correctRemarks}
                onChange={(e) => setCorrectRemarks(e.target.value)}
                placeholder="Correction to match physical/manual count"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg px-4 py-2">
              Save Correction
            </button>
            <button
              type="button"
              onClick={() => setShowCorrectForm(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="no-print bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <div>
            <label className="block text-sm text-slate-600 mb-1">Date</label>
            <input
              type="date"
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.entry_date}
              onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">IN</label>
            <input
              type="number"
              min="0"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.in_qty}
              onChange={(e) => setForm({ ...form, in_qty: e.target.value, out_qty: '' })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">OUT</label>
            <input
              type="number"
              min="0"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.out_qty}
              onChange={(e) => setForm({ ...form, out_qty: e.target.value, in_qty: '' })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Handled By</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.handled_by}
              onChange={(e) => setForm({ ...form, handled_by: e.target.value })}
              placeholder="Signature name"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Expiry Date</label>
            <input
              type="date"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.expiry_date}
              onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Invoice #</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.invoice_no}
              onChange={(e) => setForm({ ...form, invoice_no: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Remarks</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            />
          </div>
          <div className="col-span-full flex gap-2">
            <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2">
              Save Entry
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden print:border-none print:rounded-none">
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4 print:hidden">Stock Card</h2>

          {/* The item info block lives in this table's own <thead>, alongside
              the seal/page-label row and the column headers, so all of it
              repeats together at the top of every physical page this table
              breaks across -- keeping it in a separate table before this one
              meant the seal only ever rendered wherever this table happened
              to start in the page flow (i.e. after the info block, mid-page),
              not at the actual top of the page. */}
          <table className="w-full text-sm border-collapse">
            <thead>
              <PrintHeaderRow
                pageLabel={estimatePageLabel(Math.max(entries.length, MIN_ROWS), MIN_ROWS)}
                colSpan={7}
              />
              <PrintTitleRow title="Stock Card" colSpan={7} />
              {/* A compact box confined to the first 2 real columns (plus a
                  borderless filler cell for the rest of the row), matching
                  the official template's narrow label/value box -- an
                  earlier version spanned the full row width, which
                  stretched the box across the whole table and made every
                  row much taller than the template's tight single-line
                  rows. */}
              <tr>
                <td colSpan={2} className="border border-slate-300 p-0">
                  <div className="flex items-stretch">
                    <span className="font-semibold bg-slate-50 border-r border-slate-300 px-2 py-0.5 w-36 shrink-0 whitespace-nowrap">
                      DEPARTMENT
                    </span>
                    <span className="px-2 py-0.5">{item.department_name}</span>
                  </div>
                </td>
                <td colSpan={5} className="border-0 p-0"></td>
              </tr>
              <tr>
                <td colSpan={2} className="border border-slate-300 p-0">
                  <div className="flex items-stretch">
                    <span className="font-semibold bg-slate-50 border-r border-slate-300 px-2 py-0.5 w-36 shrink-0 whitespace-nowrap">
                      LABORATORY
                    </span>
                    <span className="px-2 py-0.5">{item.laboratory_name}</span>
                  </div>
                </td>
                <td colSpan={5} className="border-0 p-0"></td>
              </tr>
              <tr>
                <td colSpan={2} className="border border-slate-300 p-0">
                  <div className="flex items-stretch">
                    <span className="font-semibold bg-slate-50 border-r border-slate-300 px-2 py-0.5 w-36 shrink-0 whitespace-nowrap">
                      ITEM NAME
                    </span>
                    <span className="px-2 py-0.5">{item.item_name}</span>
                  </div>
                </td>
                <td colSpan={5} className="border-0 p-0"></td>
              </tr>
              <tr>
                <td colSpan={2} className="border border-slate-300 p-0">
                  <div className="flex items-stretch">
                    <span className="font-semibold bg-slate-50 border-r border-slate-300 px-2 py-0.5 w-36 shrink-0 whitespace-nowrap">
                      UNIT OF MEASURE
                    </span>
                    <span className="px-2 py-0.5">{item.unit_of_measure}</span>
                  </div>
                </td>
                <td colSpan={5} className="border-0 p-0"></td>
              </tr>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Date</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-right">
                  Beginning Balance
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-right">IN</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-right">OUT</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-right">
                  Ending Balance
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Remarks</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Signature</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left no-print w-16">
                  &nbsp;
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-3 py-2"></td>
                <td className="border border-slate-300 px-3 py-2 text-right font-medium">
                  {item.initial_balance}
                </td>
                <td className="border border-slate-300 px-3 py-2"></td>
                <td className="border border-slate-300 px-3 py-2"></td>
                <td className="border border-slate-300 px-3 py-2"></td>
                <td className="border border-slate-300 px-3 py-2 text-slate-500 italic">
                  Initial balance
                </td>
                <td className="border border-slate-300 px-3 py-2"></td>
                <td className="border border-slate-300 px-3 py-2 no-print"></td>
              </tr>
              {padRows(entries, MIN_ROWS).map((entry) =>
                entry.__blank ? (
                  <tr key={entry.id}>
                    <td className="border border-slate-300 px-3 py-2"></td>
                    <td className="border border-slate-300 px-3 py-2"></td>
                    <td className="border border-slate-300 px-3 py-2"></td>
                    <td className="border border-slate-300 px-3 py-2"></td>
                    <td className="border border-slate-300 px-3 py-2"></td>
                    <td className="border border-slate-300 px-3 py-2"></td>
                    <td className="border border-slate-300 px-3 py-2"></td>
                    <td className="border border-slate-300 px-3 py-2 no-print"></td>
                  </tr>
                ) : entry.is_period_marker ? (
                  <tr key={entry.id} className="bg-slate-500 text-white">
                    <td className="border border-slate-500 px-3 py-1 text-center" colSpan={5}>
                      {entry.remarks || '--'} ({entry.entry_date})
                    </td>
                    <td className="border border-slate-500 px-3 py-1" colSpan={2}></td>
                    <td className="border border-slate-500 px-3 py-1 no-print text-center">
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="text-white/80 hover:text-white text-xs underline"
                      >
                        remove
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={entry.id}>
                    <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{entry.entry_date}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right">
                      {entry.beginning_balance}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right text-emerald-700">
                      {entry.in_qty || ''}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right text-red-700">
                      {entry.out_qty || ''}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right font-medium">
                      {entry.ending_balance}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      {entry.remarks}
                      {entry.expiry_date && (
                        <div className="text-xs text-slate-500">expiry date: {entry.expiry_date}</div>
                      )}
                      {entry.invoice_no && (
                        <div className="text-xs text-slate-500">invoice #: {entry.invoice_no}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">{entry.handled_by}</td>
                    <td className="border border-slate-300 px-3 py-2 no-print text-center">
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="text-slate-400 hover:text-red-600 text-xs underline"
                      >
                        remove
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>

          <PrintFooter code="F-LAB-006" date="04-01-25" />
        </div>
      </div>
    </div>
  );
}

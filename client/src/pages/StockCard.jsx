import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import LabFormTabs from '../components/LabFormTabs';

const emptyForm = {
  entry_date: new Date().toISOString().slice(0, 10),
  in_qty: '',
  out_qty: '',
  remarks: '',
  expiry_date: '',
  invoice_no: '',
  handled_by: '',
};

export default function StockCard() {
  const { id } = useParams();
  const [card, setCard] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
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
    if (!confirm('Delete this entry?')) return;
    await api.delete(`/transactions/${entryId}`);
    load();
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
          {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
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

      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden print:border-black print:rounded-none">
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Stock Card</h2>
          <table className="mb-4 text-sm">
            <tbody>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 w-40">
                  DEPARTMENT
                </td>
                <td className="border border-slate-300 px-3 py-1.5">{item.department_name}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">
                  LABORATORY
                </td>
                <td className="border border-slate-300 px-3 py-1.5">{item.laboratory_name}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">
                  ITEM NAME
                </td>
                <td className="border border-slate-300 px-3 py-1.5">{item.item_name}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">
                  UNIT OF MEASURE
                </td>
                <td className="border border-slate-300 px-3 py-1.5">{item.unit_of_measure}</td>
              </tr>
            </tbody>
          </table>

          <table className="w-full text-sm border-collapse">
            <thead>
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
              {entries.map((entry) =>
                entry.is_period_marker ? (
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
                    <td className="border border-slate-300 px-3 py-2">{entry.entry_date}</td>
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
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import LabFormTabs from '../components/LabFormTabs';

const STATUS_OPTIONS = ['Pending', 'Released', 'Denied'];

const emptyForm = {
  request_date: new Date().toISOString().slice(0, 10),
  item_description: '',
  quantity: '',
  unit: '',
  purpose: '',
  requested_by: '',
};

// Shared by the Bookstore Requisition Slip and Supplies Requisition Slip --
// identically shaped, only the title differs.
export default function RequisitionSlip({ apiBase, tabKey, formTitle }) {
  const { id } = useParams();
  const [lab, setLab] = useState(null);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  function loadRows() {
    api.get(`/${apiBase}`, { params: { laboratory_id: id } }).then((res) => setRows(res.data));
  }

  useEffect(() => {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startNew() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      request_date: row.request_date,
      item_description: row.item_description,
      quantity: row.quantity || '',
      unit: row.unit || '',
      purpose: row.purpose || '',
      requested_by: row.requested_by || '',
      status: row.status,
    });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/${apiBase}/${editingId}`, form);
      } else {
        await api.post(`/${apiBase}`, { ...form, laboratory_id: id });
      }
      setShowForm(false);
      loadRows();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    }
  }

  async function handleDelete(rowId) {
    if (!confirm('Delete this requisition entry?')) return;
    await api.delete(`/${apiBase}/${rowId}`);
    loadRows();
  }

  if (!lab) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to Laboratories
        </Link>
        <div className="space-x-2">
          <button
            onClick={startNew}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            + Add Row
          </button>
          <button
            onClick={() => window.print()}
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Print
          </button>
        </div>
      </div>

      <LabFormTabs laboratoryId={id} active={tabKey} />

      {error && <p className="text-sm text-red-600 no-print">{error}</p>}

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
              value={form.request_date}
              onChange={(e) => setForm({ ...form, request_date: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Item Description</label>
            <input
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.item_description}
              onChange={(e) => setForm({ ...form, item_description: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Quantity</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Unit</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Purpose</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Requested By</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.requested_by}
              onChange={(e) => setForm({ ...form, requested_by: e.target.value })}
              placeholder="Signature name"
            />
          </div>
          {editingId && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">Status</label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="col-span-full flex gap-2">
            <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2">
              Save
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
          <h2 className="text-lg font-bold text-slate-800 mb-4 text-center">{formTitle}</h2>
          <p className="text-sm text-slate-500 mb-3">
            <span className="font-semibold">Laboratory:</span> {lab.name}
          </p>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Date</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Item Description</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-right">Qty</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Unit</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Purpose</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Requested By</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Status</th>
                <th className="border border-slate-300 px-3 py-2 no-print w-24">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="border border-slate-300 px-3 py-2">{row.request_date}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.item_description}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{row.quantity}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.unit}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.purpose}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.requested_by}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.status}</td>
                  <td className="border border-slate-300 px-3 py-2 no-print text-center space-x-2">
                    <button onClick={() => startEdit(row)} className="text-slate-500 hover:text-slate-800 text-xs underline">
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(row.id)}
                      className="text-slate-400 hover:text-red-600 text-xs underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="border border-slate-300 px-3 py-6 text-center text-slate-400">
                    No entries yet.
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

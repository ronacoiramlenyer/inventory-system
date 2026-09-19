import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import LabFormTabs from '../components/LabFormTabs';

const emptyItem = { description: '', equipment_id_text: '' };

export default function NewBorrowingRequest() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    borrower_name: '',
    department_unit: '',
    date_needed: '',
    purpose: '',
    return_date: '',
  });
  const [items, setItems] = useState([{ ...emptyItem }]);

  function updateItem(i, field, value) {
    setItems((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function addItem() {
    setItems((rows) => [...rows, { ...emptyItem }]);
  }

  function removeItem(i) {
    setItems((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/borrowing-requests', {
        ...form,
        laboratory_id: id,
        items: items.filter((it) => it.description.trim()),
      });
      navigate(`/borrowing-requests/${data.id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request');
      setSubmitting(false);
    }
  }

  if (user.role !== 'staff' && user.role !== 'admin') {
    return (
      <div className="space-y-4">
        <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to Laboratories
        </Link>
        <p className="text-sm text-red-600">
          Only the lab custodian (staff) can file a Borrowing Request for this laboratory.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to Laboratories
      </Link>

      <LabFormTabs laboratoryId={id} active="borrowing-request" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={handleSubmit} className="bg-white border border-slate-300 rounded-xl p-6 space-y-4 max-w-2xl">
        <h2 className="text-lg font-bold text-slate-800 text-center">Borrowing Request Form (BRF)</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Borrower's Name</label>
            <input
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.borrower_name}
              onChange={(e) => setForm({ ...form, borrower_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Department/Unit</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.department_unit}
              onChange={(e) => setForm({ ...form, department_unit: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Date Needed</label>
            <input
              type="date"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.date_needed}
              onChange={(e) => setForm({ ...form, date_needed: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Return Date</label>
            <input
              type="date"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.return_date}
              onChange={(e) => setForm({ ...form, return_date: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Purpose</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-700">Items</h3>
            <button
              type="button"
              onClick={addItem}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg px-3 py-1.5"
            >
              + Add Item
            </button>
          </div>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateItem(i, 'description', e.target.value)}
                />
                <input
                  className="w-40 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Equipment ID (if applicable)"
                  value={item.equipment_id_text}
                  onChange={(e) => updateItem(i, 'equipment_id_text', e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="text-slate-400 hover:text-red-600 text-xs underline"
                >
                  remove
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1">
          <p className="font-semibold">Terms & Conditions</p>
          <p>By submitting, the borrower acknowledges and agrees to the following:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Full responsibility for the issued equipment or use of the laboratory.</li>
            <li>Agreement to pay for any damage or loss incurred.</li>
            <li>Confirmation that all items are in functional condition unless otherwise noted.</li>
            <li>Waiver of liability claims related to the use of this equipment.</li>
          </ul>
        </div>

        <button
          disabled={submitting}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
      </form>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import LabFormTabs from '../components/LabFormTabs';

const STATUS_OPTIONS = ['Pending', 'Approved', 'Returned'];

export default function BorrowingRequestDetail() {
  const { id } = useParams();
  const [req, setReq] = useState(null);
  const [items, setItems] = useState([]);
  const [approvedBy, setApprovedBy] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    api.get(`/borrowing-requests/${id}`).then((res) => {
      setReq(res.data);
      setItems(res.data.items);
      setApprovedBy(res.data.approved_by || '');
      setStatus(res.data.status);
    });
  }

  useEffect(load, [id]);

  function updateItem(itemId, value) {
    setItems((rows) => rows.map((r) => (r.id === itemId ? { ...r, returned_condition: value } : r)));
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.put(`/borrowing-requests/${id}`, {
        approved_by: approvedBy,
        status,
        items: items.map((it) => ({ id: it.id, returned_condition: it.returned_condition })),
      });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!req) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link
          to={`/laboratories/${req.laboratory_id}/borrowing-requests`}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Back to {req.laboratory_name}
        </Link>
        <button
          onClick={() => window.print()}
          className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          Print
        </button>
      </div>

      <LabFormTabs laboratoryId={req.laboratory_id} active="borrowing-request" />

      {error && <p className="text-sm text-red-600 no-print">{error}</p>}

      <div className="bg-white border border-slate-300 rounded-xl p-6 max-w-2xl">
        <h2 className="text-lg font-bold text-slate-800 text-center mb-4">Borrowing Request Form (BRF)</h2>

        <table className="w-full text-sm border-collapse mb-4">
          <tbody>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 w-56">
                Borrower's Name and Signature:
              </td>
              <td className="border border-slate-300 px-3 py-1.5">{req.borrower_name}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Department/Unit:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.department_unit}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Date Needed:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.date_needed}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Purpose:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.purpose}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Return Date:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.return_date}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Item</th>
              <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Description</th>
              <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Equipment ID (if applicable)</th>
              <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Returned Condition</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id}>
                <td className="border border-slate-300 px-3 py-2">{i + 1}</td>
                <td className="border border-slate-300 px-3 py-2">{item.description}</td>
                <td className="border border-slate-300 px-3 py-2">{item.equipment_id_text}</td>
                <td className="border border-slate-300 px-3 py-2 no-print">
                  <input
                    className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                    value={item.returned_condition || ''}
                    onChange={(e) => updateItem(item.id, e.target.value)}
                  />
                </td>
                <td className="hidden print:table-cell border border-slate-300 px-3 py-2">
                  {item.returned_condition}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="border border-slate-300 px-3 py-4 text-center text-slate-400">
                  No items listed.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1 mb-4">
          <p className="font-semibold">Terms & Conditions</p>
          <p>By signing, the borrower acknowledges and agrees to the following:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Full responsibility for the issued equipment or use of the laboratory.</li>
            <li>Agreement to pay for any damage or loss incurred.</li>
            <li>Confirmation that all items are in functional condition unless otherwise noted.</li>
            <li>Waiver of liability claims related to the use of this equipment.</li>
          </ul>
        </div>

        <form onSubmit={handleSave} className="space-y-3 no-print">
          <h3 className="font-semibold text-slate-700">Approval / Status</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Status</label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Approved by (Name)</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={approvedBy}
                onChange={(e) => setApprovedBy(e.target.value)}
              />
            </div>
          </div>
          <button
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>

        <div className="hidden print:block mt-4 text-sm">
          <p>Status: {status}</p>
          {approvedBy && <p>Approved by: {approvedBy}</p>}
        </div>
      </div>
    </div>
  );
}

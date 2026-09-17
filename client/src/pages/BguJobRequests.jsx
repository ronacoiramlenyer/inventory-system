import { useEffect, useState } from 'react';
import api from '../api/client';
import { refreshNotifications } from '../api/notifications';
import { useAuth } from '../context/AuthContext';
import OtherRequestsTabs from '../components/OtherRequestsTabs';

const MANAGE_STATUS_OPTIONS = ['Filed', 'In Progress', 'Completed'];

function emptyForm(laboratoryId) {
  return {
    laboratory_id: laboratoryId || '',
    request_date: new Date().toISOString().slice(0, 10),
    job_classification: 'Minor',
    description: '',
    requested_by: '',
  };
}

function inScope(user, row) {
  if (user.role === 'secretary') {
    return (user.department_ids || []).map(Number).includes(Number(row.department_id));
  }
  return Number(row.department_id) === Number(user.department_id);
}

function canApproveRow(user, row) {
  return user.role === 'admin' || (user.role === 'subject_coordinator' && inScope(user, row));
}

function canManageFiledRow(user, row) {
  return canApproveRow(user, row) || (user.role === 'secretary' && inScope(user, row));
}

// A request to BGU (Building & Grounds Unit) to perform a job, not the lab's
// own F-LAB form, so it lives at the top level, is tagged to whichever lab
// the staff picks, and follows the same Pending -> Subject Coordinator
// approval -> Filed -> Secretary fulfillment workflow as F-LAB-004.
export default function BguJobRequests() {
  const { user } = useAuth();
  const [labs, setLabs] = useState([]);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [statusEditId, setStatusEditId] = useState(null);
  const [statusValue, setStatusValue] = useState('');
  const [error, setError] = useState('');

  function loadRows() {
    api.get('/bgu-job-requests').then((res) => setRows(res.data));
  }

  useEffect(() => {
    api.get('/laboratories', { params: { status: 'approved' } }).then((res) => setLabs(res.data));
    loadRows();
  }, []);

  function startNew() {
    setStatusEditId(null);
    setForm(emptyForm(labs[0]?.id));
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.laboratory_id) {
      setError('Select the laboratory this request originates from');
      return;
    }
    try {
      await api.post('/bgu-job-requests', form);
      setShowForm(false);
      loadRows();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    }
  }

  async function handleApprove(row) {
    setError('');
    try {
      await api.post(`/bgu-job-requests/${row.id}/approve`);
      loadRows();
      refreshNotifications();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve');
    }
  }

  function startStatusEdit(row) {
    setShowForm(false);
    setStatusEditId(row.id);
    setStatusValue(row.status === 'Pending' ? 'Filed' : row.status);
  }

  async function handleStatusSave(e) {
    e.preventDefault();
    setError('');
    try {
      await api.put(`/bgu-job-requests/${statusEditId}`, { status: statusValue });
      setStatusEditId(null);
      loadRows();
      refreshNotifications();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update status');
    }
  }

  async function handleDelete(rowId) {
    if (!confirm('Delete this job request?')) return;
    try {
      await api.delete(`/bgu-job-requests/${rowId}`);
      loadRows();
      refreshNotifications();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-lg font-bold text-slate-800">Other Requests</h1>
        <div className="space-x-2">
          {user.role !== 'secretary' && (
            <button
              onClick={startNew}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
            >
              + Add Row
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Print
          </button>
        </div>
      </div>

      <OtherRequestsTabs active="bgu" />

      {error && <p className="text-sm text-red-600 no-print">{error}</p>}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="no-print bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <div>
            <label className="block text-sm text-slate-600 mb-1">Laboratory</label>
            <select
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.laboratory_id}
              onChange={(e) => setForm({ ...form, laboratory_id: Number(e.target.value) })}
            >
              <option value="">Select laboratory…</option>
              {labs.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.name}
                </option>
              ))}
            </select>
          </div>
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
          <div>
            <label className="block text-sm text-slate-600 mb-1">Classification</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.job_classification}
              onChange={(e) => setForm({ ...form, job_classification: e.target.value })}
            >
              <option value="Minor">Minor</option>
              <option value="Major">Major</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Description of Job</label>
            <input
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
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

      {statusEditId && (
        <form
          onSubmit={handleStatusSave}
          className="no-print bg-white border border-slate-200 rounded-xl p-4 flex items-end gap-3"
        >
          <div>
            <label className="block text-sm text-slate-600 mb-1">Update Status</label>
            <select
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={statusValue}
              onChange={(e) => setStatusValue(e.target.value)}
            >
              {MANAGE_STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2">
            Save
          </button>
          <button
            type="button"
            onClick={() => setStatusEditId(null)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg px-4 py-2"
          >
            Cancel
          </button>
        </form>
      )}

      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden print:border-none print:rounded-none">
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4 text-center">BGU Minor and Major Job Request</h2>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Date</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Laboratory</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Classification</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Description of Job</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Requested By</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Approved By</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Status</th>
                <th className="border border-slate-300 px-3 py-2 no-print w-32">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const showApprove = row.status === 'Pending' && canApproveRow(user, row);
                const showManage = row.status !== 'Pending' && canManageFiledRow(user, row);
                const showDelete = user.role === 'admin' || row.status === 'Pending';
                return (
                  <tr key={row.id}>
                    <td className="border border-slate-300 px-3 py-2">{row.request_date}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.laboratory_name}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.job_classification}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.description}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.requested_by}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.approved_by}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.status}</td>
                    <td className="border border-slate-300 px-3 py-2 no-print text-center space-x-2">
                      {showApprove && (
                        <button onClick={() => handleApprove(row)} className="text-emerald-700 hover:text-emerald-900 text-xs underline">
                          Approve
                        </button>
                      )}
                      {showManage && (
                        <button onClick={() => startStatusEdit(row)} className="text-slate-500 hover:text-slate-800 text-xs underline">
                          Update Status
                        </button>
                      )}
                      {showDelete && (
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="text-slate-400 hover:text-red-600 text-xs underline"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
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

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';

const emptyForm = { name: '', location: '', department_id: '' };

const STATUS_STYLES = {
  approved: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function Laboratories() {
  const { user } = useAuth();
  const confirmDialog = useConfirm();
  const isAdmin = user.role === 'admin';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [labs, setLabs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  function load() {
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (isAdmin && departmentFilter) params.department_id = departmentFilter;
    api.get('/laboratories', { params }).then((res) => setLabs(res.data));
  }

  useEffect(load, [statusFilter, departmentFilter]);

  // A staff account with exactly one laboratory doesn't need a list — take
  // them straight to it.
  useEffect(() => {
    if (!isAdmin && !statusFilter && !departmentFilter && labs.length === 1) {
      navigate(`/laboratories/${labs[0].id}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labs]);
  useEffect(() => {
    if (isAdmin) api.get('/departments').then((res) => setDepartments(res.data));
  }, []);

  function startEdit(lab) {
    setEditingId(lab.id);
    setForm({ name: lab.name, location: lab.location || '', department_id: lab.department_id });
    setShowForm(true);
  }

  function startNew() {
    setEditingId(null);
    setForm({ ...emptyForm, department_id: isAdmin ? departments[0]?.id || '' : '' });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/laboratories/${editingId}`, form);
      } else {
        await api.post('/laboratories', form);
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save laboratory');
    }
  }

  async function handleDelete(id) {
    if (!(await confirmDialog('Delete this laboratory and all its items? This cannot be undone.'))) return;
    await api.delete(`/laboratories/${id}`);
    load();
  }

  async function handleApprove(id) {
    await api.post(`/laboratories/${id}/approve`);
    load();
  }

  async function handleReject(id) {
    const reason = prompt('Reason for rejecting this laboratory request (optional):') || '';
    await api.post(`/laboratories/${id}/reject`, { reason });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-800">
          {isAdmin ? 'Laboratories' : `${user.department_name} Laboratories`}
        </h1>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <select
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <select
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            onClick={startNew}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            {isAdmin ? '+ Add Laboratory' : '+ Enroll a Laboratory'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 max-w-md">
          <h2 className="font-semibold text-slate-700">
            {editingId ? 'Edit Laboratory' : isAdmin ? 'New Laboratory' : 'Enroll a Laboratory'}
          </h2>
          {!isAdmin && !editingId && (
            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              This will be submitted to an admin for approval under{' '}
              <span className="font-medium">{user.department_name}</span>.
            </p>
          )}
          <div>
            <label className="block text-sm text-slate-600 mb-1">Name</label>
            <input
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Science Laboratory 2"
            />
          </div>
          {isAdmin && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">Department</label>
              <select
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: Number(e.target.value) })}
              >
                <option value="" disabled>
                  Select department
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm text-slate-600 mb-1">Location</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g. Room 201"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2">
              {editingId ? 'Save' : isAdmin ? 'Save' : 'Submit for Approval'}
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              {isAdmin && <th className="px-4 py-2 text-left font-medium">Department</th>}
              <th className="px-4 py-2 text-left font-medium">Location</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Items</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {labs.map((lab) => (
              <tr key={lab.id}>
                <td className="px-4 py-3 font-medium">
                  <Link to={`/laboratories/${lab.id}`} className="text-emerald-700 hover:underline">
                    {lab.name}
                  </Link>
                </td>
                {isAdmin && <td className="px-4 py-3 text-slate-600">{lab.department_name}</td>}
                <td className="px-4 py-3 text-slate-600">{lab.location}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold rounded-full px-2 py-1 ${STATUS_STYLES[lab.status]}`}>
                    {lab.status}
                  </span>
                  {lab.status === 'rejected' && lab.rejection_reason && (
                    <p className="text-xs text-slate-400 mt-1">{lab.rejection_reason}</p>
                  )}
                  {lab.status === 'pending' && lab.requested_by_name && (
                    <p className="text-xs text-slate-400 mt-1">by {lab.requested_by_name}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{lab.item_count} items</td>
                <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                  {isAdmin && lab.status === 'pending' && (
                    <>
                      <button onClick={() => handleApprove(lab.id)} className="text-emerald-700 hover:text-emerald-900">
                        Approve
                      </button>
                      <button onClick={() => handleReject(lab.id)} className="text-red-600 hover:text-red-800">
                        Reject
                      </button>
                    </>
                  )}
                  {isAdmin && (
                    <>
                      <button onClick={() => startEdit(lab)} className="text-slate-600 hover:text-slate-900">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(lab.id)} className="text-red-600 hover:text-red-800">
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {labs.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-6 text-center text-slate-400">
                  No laboratories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

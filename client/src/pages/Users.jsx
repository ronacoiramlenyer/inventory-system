import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';

const emptyForm = {
  full_name: '',
  username: '',
  password: '',
  role: 'staff',
  department_id: '',
  department_ids: [],
};

const ROLE_LABELS = {
  admin: 'Admin',
  staff: 'Staff',
  subject_coordinator: 'Subject Coordinator',
  secretary: 'Secretary',
};

export default function Users() {
  const { user: currentUser } = useAuth();
  const confirmDialog = useConfirm();
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [error, setError] = useState('');

  function load() {
    api.get('/users').then((res) => setUsers(res.data));
    api.get('/departments').then((res) => setDepartments(res.data));
  }

  useEffect(load, []);

  function toggleDepartment(id) {
    setForm((f) => ({
      ...f,
      department_ids: f.department_ids.includes(id)
        ? f.department_ids.filter((d) => d !== id)
        : [...f.department_ids, id],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingUserId) {
        // Edit mode: don't send password if empty
        const payload = { ...form };
        if (!payload.password) {
          delete payload.password;
        }
        await api.put(`/users/${editingUserId}`, payload);
      } else {
        // Create mode: password required
        await api.post('/users', form);
      }
      setForm(emptyForm);
      setShowForm(false);
      setEditingUserId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || `Failed to ${editingUserId ? 'update' : 'create'} user`);
    }
  }

  function handleEdit(user) {
    setEditingUserId(user.id);
    setForm({
      full_name: user.full_name,
      username: user.username,
      password: '',
      role: user.role,
      department_id: user.department_id || '',
      department_ids: user.departments?.map((d) => d.id) || [],
    });
    setShowForm(true);
  }

  async function handleDelete(id) {
    if (!(await confirmDialog('Delete this account?'))) return;
    try {
      await api.delete(`/users/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Staff Accounts</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          + Add Account
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-3 max-w-lg">
          <h3 className="col-span-2 font-semibold text-slate-800 mb-2">
            {editingUserId ? 'Edit Account' : 'Create New Account'}
          </h3>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Full Name</label>
            <input
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Username</label>
            <input
              required
              disabled={!!editingUserId}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            {editingUserId && <p className="text-xs text-slate-500 mt-1">Username cannot be changed</p>}
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Password {!editingUserId && <span className="text-red-600">*</span>}
            </label>
            <input
              type="password"
              required={!editingUserId}
              placeholder={editingUserId ? 'Leave empty to keep current password' : ''}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Role</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="staff">Staff</option>
              <option value="subject_coordinator">Subject Coordinator</option>
              <option value="secretary">Secretary</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {form.role === 'secretary' && (
            <div className="col-span-2">
              <label className="block text-sm text-slate-600 mb-2">Departments (can cover more than one)</label>
              <div className="grid grid-cols-2 gap-2">
                {departments.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.department_ids.includes(d.id)}
                      onChange={() => toggleDepartment(d.id)}
                    />
                    {d.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {form.role !== 'admin' && form.role !== 'secretary' && (
            <div className="col-span-2">
              <label className="block text-sm text-slate-600 mb-1">Department</label>
              <select
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
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
          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
          <div className="col-span-2 flex gap-2">
            <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2">
              {editingUserId ? 'Update Account' : 'Create Account'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingUserId(null);
                setForm(emptyForm);
              }}
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
              <th className="px-4 py-2 text-left font-medium">Username</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">Department</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{u.full_name}</td>
                <td className="px-4 py-3 text-slate-600">{u.username}</td>
                <td className="px-4 py-3 text-slate-600">{ROLE_LABELS[u.role] || 'Staff'}</td>
                <td className="px-4 py-3 text-slate-600">
                  {u.role === 'secretary'
                    ? u.departments?.map((d) => d.name).join(', ') || '—'
                    : u.department_name || '—'}
                </td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button
                    onClick={() => handleEdit(u)}
                    className="text-emerald-600 hover:text-emerald-800 text-sm underline"
                  >
                    Edit
                  </button>
                  {u.id !== currentUser.id && (
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="text-red-600 hover:text-red-800 text-sm underline"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

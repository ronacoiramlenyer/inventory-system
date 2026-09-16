import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState('');

  function load() {
    api.get('/departments').then((res) => setDepartments(res.data));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/departments', { name });
      setName('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create department');
    }
  }

  async function handleRename(id) {
    setError('');
    try {
      await api.put(`/departments/${id}`, { name: editingName });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to rename department');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this department? Its laboratories and staff accounts will be affected.')) return;
    await api.delete(`/departments/${id}`);
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Departments</h1>

      <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-4 flex gap-3 max-w-md">
        <input
          required
          placeholder="e.g. Mathematics"
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2">
          + Add
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Approved Labs</th>
              <th className="px-4 py-2 text-left font-medium">Staff Accounts</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {departments.map((dept) => (
              <tr key={dept.id}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {editingId === dept.id ? (
                    <input
                      autoFocus
                      className="border border-slate-300 rounded-lg px-2 py-1 text-sm"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                    />
                  ) : (
                    dept.name
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{dept.laboratory_count}</td>
                <td className="px-4 py-3 text-slate-600">{dept.staff_count}</td>
                <td className="px-4 py-3 text-right space-x-3">
                  {editingId === dept.id ? (
                    <>
                      <button onClick={() => handleRename(dept.id)} className="text-emerald-700 hover:text-emerald-900">
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-800">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(dept.id);
                          setEditingName(dept.name);
                        }}
                        className="text-slate-600 hover:text-slate-900"
                      >
                        Rename
                      </button>
                      <button onClick={() => handleDelete(dept.id)} className="text-red-600 hover:text-red-800">
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {departments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No departments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

const emptyForm = { name: '', department: '', location: '' };

export default function Laboratories() {
  const [labs, setLabs] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  function load() {
    api.get('/laboratories').then((res) => setLabs(res.data));
  }

  useEffect(load, []);

  function startEdit(lab) {
    setEditingId(lab.id);
    setForm({ name: lab.name, department: lab.department, location: lab.location || '' });
    setShowForm(true);
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm);
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
    if (!confirm('Delete this laboratory and all its items? This cannot be undone.')) return;
    await api.delete(`/laboratories/${id}`);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Laboratories</h1>
        <button
          onClick={startNew}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          + Add Laboratory
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 max-w-md">
          <h2 className="font-semibold text-slate-700">{editingId ? 'Edit' : 'New'} Laboratory</h2>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Name</label>
            <input
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Science Laboratory"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Department</label>
            <input
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              placeholder="e.g. Science, Computer"
            />
          </div>
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Department</th>
              <th className="px-4 py-2 text-left font-medium">Location</th>
              <th className="px-4 py-2 text-left font-medium">Items</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {labs.map((lab) => (
              <tr key={lab.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{lab.name}</td>
                <td className="px-4 py-3 text-slate-600">{lab.department}</td>
                <td className="px-4 py-3 text-slate-600">{lab.location}</td>
                <td className="px-4 py-3">
                  <Link
                    to={`/items?laboratory_id=${lab.id}`}
                    className="text-emerald-700 hover:underline"
                  >
                    {lab.item_count} items
                  </Link>
                </td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button onClick={() => startEdit(lab)} className="text-slate-600 hover:text-slate-900">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(lab.id)} className="text-red-600 hover:text-red-800">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {labs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
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

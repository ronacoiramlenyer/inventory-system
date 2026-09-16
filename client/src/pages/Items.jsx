import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const emptyForm = {
  laboratory_id: '',
  item_name: '',
  category: '',
  unit_of_measure: '',
  initial_balance: 0,
  reorder_level: 0,
  notes: '',
};

export default function Items() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const laboratoryFilter = searchParams.get('laboratory_id') || '';

  const [items, setItems] = useState([]);
  const [labs, setLabs] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  function loadItems() {
    const params = laboratoryFilter ? { laboratory_id: laboratoryFilter } : {};
    api.get('/items', { params }).then((res) => setItems(res.data));
  }

  useEffect(() => {
    // Only approved laboratories can hold items.
    api.get('/laboratories', { params: { status: 'approved' } }).then((res) => setLabs(res.data));
  }, []);

  useEffect(loadItems, [laboratoryFilter]);

  function startNew() {
    setEditingId(null);
    setForm({ ...emptyForm, laboratory_id: laboratoryFilter || labs[0]?.id || '' });
    setShowForm(true);
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      laboratory_id: item.laboratory_id,
      item_name: item.item_name,
      category: item.category || '',
      unit_of_measure: item.unit_of_measure,
      initial_balance: item.initial_balance,
      reorder_level: item.reorder_level,
      notes: item.notes || '',
    });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/items/${editingId}`, form);
      } else {
        await api.post('/items', form);
      }
      setShowForm(false);
      loadItems();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save item');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this item and its stock card history?')) return;
    await api.delete(`/items/${id}`);
    loadItems();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Items</h1>
        <div className="flex items-center gap-3">
          <select
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={laboratoryFilter}
            onChange={(e) => {
              const v = e.target.value;
              setSearchParams(v ? { laboratory_id: v } : {});
            }}
          >
            <option value="">All laboratories</option>
            {labs.map((lab) => (
              <option key={lab.id} value={lab.id}>
                {lab.name}
              </option>
            ))}
          </select>
          <button
            onClick={startNew}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            + Add Item
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-500 -mt-2">
        Adding several items at once, or doing a physical count? Use the{' '}
        <Link to="/inventory-counts" className="text-emerald-700 hover:underline">
          F-LAB-010 Inventory Sheet
        </Link>{' '}
        instead.
      </p>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 max-w-xl">
          <h2 className="font-semibold text-slate-700">{editingId ? 'Edit' : 'New'} Item</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm text-slate-600 mb-1">Laboratory</label>
              <select
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.laboratory_id}
                onChange={(e) => setForm({ ...form, laboratory_id: e.target.value })}
              >
                <option value="" disabled>
                  Select laboratory
                </option>
                {labs.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-slate-600 mb-1">Item Name</label>
              <input
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.item_name}
                onChange={(e) => setForm({ ...form, item_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Category</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Reagent, Equipment"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Unit of Measure</label>
              <input
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.unit_of_measure}
                onChange={(e) => setForm({ ...form, unit_of_measure: e.target.value })}
                placeholder="e.g. pcs, bottle, box"
              />
            </div>
            {!editingId && (
              <div>
                <label className="block text-sm text-slate-600 mb-1">Initial Balance</label>
                <input
                  type="number"
                  min="0"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={form.initial_balance}
                  onChange={(e) => setForm({ ...form, initial_balance: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-slate-600 mb-1">Reorder Level</label>
              <input
                type="number"
                min="0"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-slate-600 mb-1">Notes</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
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
              <th className="px-4 py-2 text-left font-medium">Item</th>
              <th className="px-4 py-2 text-left font-medium">Laboratory</th>
              {isAdmin && <th className="px-4 py-2 text-left font-medium">Department</th>}
              <th className="px-4 py-2 text-left font-medium">Category</th>
              <th className="px-4 py-2 text-right font-medium">Balance</th>
              <th className="px-4 py-2 text-left font-medium">UoM</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const low = item.current_balance <= item.reorder_level;
              return (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/items/${item.id}`} className="text-emerald-700 hover:underline">
                      {item.item_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.laboratory_name}</td>
                  {isAdmin && <td className="px-4 py-3 text-slate-600">{item.department_name}</td>}
                  <td className="px-4 py-3 text-slate-600">{item.category}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${low ? 'text-red-600' : 'text-slate-800'}`}>
                    {item.current_balance}
                    {low && <span className="ml-1 text-xs font-normal">(low)</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.unit_of_measure}</td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <button onClick={() => startEdit(item)} className="text-slate-600 hover:text-slate-900">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="px-4 py-6 text-center text-slate-400">
                  No items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

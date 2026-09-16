import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const LAB_STATUS_STYLES = {
  approved: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
};

const COUNT_STATUS_STYLES = {
  draft: 'bg-amber-100 text-amber-700',
  applied: 'bg-emerald-100 text-emerald-700',
};

const emptyItemForm = { item_name: '', category: '', unit_of_measure: '', initial_balance: 0, reorder_level: 0, notes: '' };

export default function LaboratoryDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const navigate = useNavigate();

  const [lab, setLab] = useState(null);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState([]);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [editingItemId, setEditingItemId] = useState(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [error, setError] = useState('');
  const [startingCount, setStartingCount] = useState(false);

  function loadLab() {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
  }

  function loadItems() {
    api.get('/items', { params: { laboratory_id: id } }).then((res) => setItems(res.data));
  }

  function loadCounts() {
    api.get('/inventory-counts', { params: { laboratory_id: id } }).then((res) => setCounts(res.data));
  }

  useEffect(() => {
    loadLab();
    loadItems();
    loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startNewItem() {
    setEditingItemId(null);
    setItemForm(emptyItemForm);
    setShowItemForm(true);
  }

  function startEditItem(item) {
    setEditingItemId(item.id);
    setItemForm({
      item_name: item.item_name,
      category: item.category || '',
      unit_of_measure: item.unit_of_measure,
      initial_balance: item.initial_balance,
      reorder_level: item.reorder_level,
      notes: item.notes || '',
    });
    setShowItemForm(true);
  }

  async function handleItemSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingItemId) {
        await api.put(`/items/${editingItemId}`, itemForm);
      } else {
        await api.post('/items', { ...itemForm, laboratory_id: id });
      }
      setShowItemForm(false);
      loadItems();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save item');
    }
  }

  async function handleDeleteItem(itemId) {
    if (!confirm('Delete this item and its stock card history?')) return;
    await api.delete(`/items/${itemId}`);
    loadItems();
  }

  async function handleStartCount() {
    setError('');
    setStartingCount(true);
    try {
      const { data } = await api.post('/inventory-counts', { laboratory_id: id });
      navigate(`/inventory-counts/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start inventory count');
      setStartingCount(false);
    }
  }

  async function handleApproveLab() {
    await api.post(`/laboratories/${id}/approve`);
    loadLab();
  }

  async function handleRejectLab() {
    const reason = prompt('Reason for rejecting this laboratory request (optional):') || '';
    await api.post(`/laboratories/${id}/reject`, { reason });
    loadLab();
  }

  if (!lab) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to Laboratories
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{lab.name}</h1>
          <p className="text-sm text-slate-500">
            {isAdmin && `${lab.department_name} · `}
            {lab.location}
          </p>
        </div>
        <span className={`text-xs font-semibold rounded-full px-2 py-1 ${LAB_STATUS_STYLES[lab.status]}`}>
          {lab.status}
        </span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {lab.status === 'pending' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm space-y-2">
          <p>This laboratory is waiting for admin approval before items can be added.</p>
          {isAdmin && (
            <div className="space-x-3">
              <button onClick={handleApproveLab} className="font-medium text-emerald-700 hover:text-emerald-900">
                Approve
              </button>
              <button onClick={handleRejectLab} className="font-medium text-red-600 hover:text-red-800">
                Reject
              </button>
            </div>
          )}
        </div>
      )}

      {lab.status === 'rejected' && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
          This laboratory's enrollment was rejected.
          {lab.rejection_reason && <> Reason: {lab.rejection_reason}</>}
        </div>
      )}

      {lab.status === 'approved' && (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Items</h2>
              <button
                onClick={startNewItem}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
              >
                + Add Item
              </button>
            </div>

            {showItemForm && (
              <form onSubmit={handleItemSubmit} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 max-w-xl">
                <h3 className="font-semibold text-slate-700">{editingItemId ? 'Edit' : 'New'} Item</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm text-slate-600 mb-1">Item Name</label>
                    <input
                      required
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      value={itemForm.item_name}
                      onChange={(e) => setItemForm({ ...itemForm, item_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">Category</label>
                    <input
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      value={itemForm.category}
                      onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                      placeholder="e.g. Reagent, Equipment"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">Unit of Measure</label>
                    <input
                      required
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      value={itemForm.unit_of_measure}
                      onChange={(e) => setItemForm({ ...itemForm, unit_of_measure: e.target.value })}
                      placeholder="e.g. pcs, bottle, box"
                    />
                  </div>
                  {!editingItemId && (
                    <div>
                      <label className="block text-sm text-slate-600 mb-1">Initial Balance</label>
                      <input
                        type="number"
                        min="0"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        value={itemForm.initial_balance}
                        onChange={(e) => setItemForm({ ...itemForm, initial_balance: e.target.value })}
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">Reorder Level</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      value={itemForm.reorder_level}
                      onChange={(e) => setItemForm({ ...itemForm, reorder_level: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-slate-600 mb-1">Notes</label>
                    <input
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      value={itemForm.notes}
                      onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2">
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowItemForm(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg px-4 py-2"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <p className="text-sm text-slate-500">
              Adding several items at once, or doing a physical count? Use the Inventory Sheet below instead.
            </p>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Item</th>
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
                        <td className="px-4 py-3 text-slate-600">{item.category}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${low ? 'text-red-600' : 'text-slate-800'}`}>
                          {item.current_balance}
                          {low && <span className="ml-1 text-xs font-normal">(low)</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{item.unit_of_measure}</td>
                        <td className="px-4 py-3 text-right space-x-3">
                          <button onClick={() => startEditItem(item)} className="text-slate-600 hover:text-slate-900">
                            Edit
                          </button>
                          <button onClick={() => handleDeleteItem(item.id)} className="text-red-600 hover:text-red-800">
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                        No items yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">F-LAB-010 Inventory Sheet</h2>
              <button
                onClick={handleStartCount}
                disabled={startingCount}
                className="bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
              >
                + New Inventory Count
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Prepared By</th>
                    <th className="px-4 py-2 text-left font-medium">Items</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {counts.map((count) => (
                    <tr key={count.id}>
                      <td className="px-4 py-3 font-medium">
                        <Link to={`/inventory-counts/${count.id}`} className="text-emerald-700 hover:underline">
                          {count.prepared_by}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{count.item_count}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-semibold rounded-full px-2 py-1 ${COUNT_STATUS_STYLES[count.status]}`}
                        >
                          {count.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{count.created_at?.slice(0, 10)}</td>
                    </tr>
                  ))}
                  {counts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                        No inventory counts yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

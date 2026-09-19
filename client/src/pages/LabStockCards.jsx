import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import LabFormTabs from '../components/LabFormTabs';

// Equipment is deliberately excluded here -- Stock Cards (F-LAB-006) is the
// IN/OUT quantity ledger for consumable stock, which doesn't apply to
// equipment; equipment lives under its own F-LAB-001 Equipment Monitoring
// Record instead (see LabEquipment.jsx).
const CATEGORIES = ['Supplies', 'Materials', 'Chemicals', 'Glassware', 'Consumables', 'Other'];
const UNCATEGORIZED = 'Uncategorized';

const emptyForm = {
  item_name: '',
  category: CATEGORIES[0],
  unit_of_measure: 'pcs',
  initial_balance: 0,
  reorder_level: 0,
};

export default function LabStockCards() {
  const { id } = useParams();
  const [lab, setLab] = useState(null);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  function loadItems() {
    api.get('/items', { params: { laboratory_id: id } }).then((res) => setItems(res.data));
  }

  useEffect(() => {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
    loadItems();
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/items', { ...form, laboratory_id: id });
      setForm(emptyForm);
      setShowForm(false);
      loadItems();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add item');
    }
  }

  if (!lab) return <p className="text-slate-500">Loading…</p>;

  const groups = new Map();
  for (const item of items) {
    if (item.category === 'Equipment') continue;
    const key = item.category || UNCATEGORIZED;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const orderedCategories = [...CATEGORIES.filter((c) => groups.has(c)), ...[...groups.keys()].filter((c) => !CATEGORIES.includes(c))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to Laboratories
        </Link>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          + Add Item
        </button>
      </div>

      <h1 className="text-2xl font-bold text-slate-800">{lab.name}</h1>

      <LabFormTabs laboratoryId={id} active="stock-cards" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
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
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
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
          <div>
            <label className="block text-sm text-slate-600 mb-1">Starting Balance</label>
            <input
              type="number"
              min="0"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.initial_balance}
              onChange={(e) => setForm({ ...form, initial_balance: e.target.value })}
            />
          </div>
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
          <div className="col-span-full flex gap-2">
            <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2">
              Save Item
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

      {groups.size === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-6 text-center text-slate-400">
          No items yet. Add one above, or add some from the Inventory Sheet.
        </div>
      )}

      {orderedCategories.map((category) => (
        <div key={category} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 font-semibold text-slate-700 text-sm">
            {category}
          </div>
          {/* table-fixed with explicit widths on Unit/Balance -- each
              category renders its own independent <table>, so with the
              default auto layout the Item column's width (and everything
              after it) was sized off that table's own longest item name,
              making the Unit/Balance columns land in different
              horizontal positions from one category block to the next. */}
          <table className="w-full text-sm table-fixed">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Item</th>
                <th className="px-4 py-2 text-left font-medium w-32">Unit</th>
                <th className="px-4 py-2 text-right font-medium w-28">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.get(category).map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/items/${item.id}`} className="text-emerald-700 hover:underline">
                      {item.item_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.unit_of_measure}</td>
                  <td className="px-4 py-3 text-right">{item.current_balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

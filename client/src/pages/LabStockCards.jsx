import { Fragment, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import LabFormTabs from '../components/LabFormTabs';
import useWideScreen from '../hooks/useWideScreen';

// Equipment items are excluded from the grouped listing below -- Stock
// Cards (F-LAB-006) is the IN/OUT quantity ledger for consumable stock,
// which doesn't apply to equipment; equipment lives under its own
// F-LAB-001 Equipment Monitoring Record instead (see LabEquipment.jsx).
// Equipment is still included as a bulk "move to category" target,
// though, so a general item that was miscategorized can be promoted to
// Equipment from here -- it just disappears from this list on the next
// load, same as if it had been created as Equipment from the start.
const CATEGORIES = ['Equipment', 'Tools & Materials', 'Consumables'];
const UNCATEGORIZED = 'Uncategorized';

// A category block is as wide as the page but only three columns deep, so a
// laboratory with two hundred tools ran as one very long list down the left
// of a mostly empty card. Split it down the middle instead: column-major, so
// an alphabetical list still reads top-to-bottom, then across.
//
// Kept to two at most -- a third column would leave the item names too narrow
// to read without truncating, which is the column that actually matters.
const MIN_ROWS_TO_SPLIT = 6;

function splitIntoColumns(rows, columns) {
  if (columns < 2 || rows.length < MIN_ROWS_TO_SPLIT) return [rows];
  const perColumn = Math.ceil(rows.length / columns);
  return Array.from({ length: columns }, (_, i) => rows.slice(i * perColumn, (i + 1) * perColumn)).filter(
    (c) => c.length
  );
}

export default function LabStockCards() {
  const { id } = useParams();
  const { user } = useAuth();
  const canEditCategory = user.role === 'staff' || user.role === 'admin';
  const wide = useWideScreen();
  const [lab, setLab] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [bulkCategory, setBulkCategory] = useState(CATEGORIES[0]);
  const [applying, setApplying] = useState(false);

  function loadItems() {
    api.get('/items', { params: { laboratory_id: id } }).then((res) => setItems(res.data));
  }

  useEffect(() => {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
    loadItems();
  }, [id]);

  function toggleSelected(itemId) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function handleApplyCategory() {
    if (selected.size === 0) return;
    setError('');
    setApplying(true);
    try {
      await Promise.all([...selected].map((itemId) => api.put(`/items/${itemId}`, { category: bulkCategory })));
      setSelected(new Set());
      loadItems();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to apply category to some items');
    } finally {
      setApplying(false);
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
      </div>

      <h1 className="text-2xl font-bold text-slate-800">{lab.name}</h1>

      <LabFormTabs laboratoryId={id} active="stock-cards" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {groups.size === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-6 text-center text-slate-400">
          No items yet. Add one from the{' '}
          <Link to={`/laboratories/${id}`} className="text-emerald-700 hover:underline">
            Inventory Sheet
          </Link>
          .
        </div>
      )}

      {/* Reassigning a wrong category one item at a time (open its Stock
          Card, Edit Item, save) doesn't scale when a whole batch of items
          landed in the wrong bucket -- lets staff/admin check off items
          from any category block here and move them all at once. */}
      {canEditCategory && selected.size > 0 && (
        <div className="sticky top-0 z-10 bg-slate-800 text-white rounded-xl shadow-sm px-4 py-3 flex items-center gap-3 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <select
            className="border border-slate-600 bg-slate-700 rounded-lg px-3 py-1.5 text-sm"
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={handleApplyCategory}
            disabled={applying}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-1.5"
          >
            {applying ? 'Applying…' : `Move to ${bulkCategory}`}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-slate-300 hover:text-white underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {orderedCategories.map((category) => {
        const columns = splitIntoColumns(groups.get(category), wide ? 2 : 1);
        return (
        <div key={category} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 font-semibold text-slate-700 text-sm">
            {category}
            <span className="ml-2 font-normal text-slate-400">{groups.get(category).length}</span>
          </div>
          {/* table-fixed with explicit widths on Unit/Balance -- each
              column renders its own independent <table>, so with the
              default auto layout the Item column's width (and everything
              after it) was sized off that table's own longest item name,
              making the Unit/Balance columns land in different
              horizontal positions from one block to the next. */}
          <div className={columns.length > 1 ? 'grid grid-cols-[1fr_auto_1fr]' : ''}>
            {columns.map((columnItems, columnIndex) => (
              <Fragment key={columnIndex}>
                {columnIndex > 0 && <div className="w-px bg-slate-200" />}
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      {canEditCategory && <th className="px-4 py-2 w-10"></th>}
                      <th className="px-4 py-2 text-left font-medium">Item</th>
                      <th className="px-4 py-2 text-left font-medium w-28">Unit</th>
                      <th className="px-4 py-2 text-right font-medium w-24">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {columnItems.map((item) => (
                      <tr key={item.id}>
                        {canEditCategory && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selected.has(item.id)}
                              onChange={() => toggleSelected(item.id)}
                            />
                          </td>
                        )}
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
              </Fragment>
            ))}
          </div>
        </div>
        );
      })}
    </div>
  );
}

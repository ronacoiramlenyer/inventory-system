import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import LabFormTabs from '../components/LabFormTabs';

export default function LabStockCards() {
  const { id } = useParams();
  const [lab, setLab] = useState(null);
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
    api.get('/items', { params: { laboratory_id: id } }).then((res) => setItems(res.data));
  }, [id]);

  if (!lab) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to Laboratories
      </Link>

      <h1 className="text-2xl font-bold text-slate-800">{lab.name}</h1>

      <LabFormTabs laboratoryId={id} active="stock-cards" />

      <p className="text-sm text-slate-500">Pick an item to open its Stock Card.</p>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Item</th>
              <th className="px-4 py-2 text-left font-medium">Unit</th>
              <th className="px-4 py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
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
            {items.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  No items yet. Add some from the Inventory Sheet first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

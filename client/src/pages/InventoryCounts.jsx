import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUS_STYLES = {
  draft: 'bg-amber-100 text-amber-700',
  applied: 'bg-emerald-100 text-emerald-700',
};

export default function InventoryCounts() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const navigate = useNavigate();

  const [counts, setCounts] = useState([]);
  const [labs, setLabs] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  function load() {
    api.get('/inventory-counts').then((res) => setCounts(res.data));
  }

  useEffect(load, []);
  useEffect(() => {
    api.get('/laboratories', { params: { status: 'approved' } }).then((res) => setLabs(res.data));
  }, []);

  async function startNew() {
    if (labs.length === 0) return;

    let lab = labs[0];
    if (labs.length > 1) {
      const choice = prompt(
        `Which laboratory?\n${labs.map((l, i) => `${i + 1}. ${l.name}`).join('\n')}\n\nEnter the number:`
      );
      const index = Number(choice) - 1;
      if (!(index >= 0 && index < labs.length)) return;
      lab = labs[index];
    }

    setError('');
    setCreating(true);
    try {
      const { data } = await api.post('/inventory-counts', { laboratory_id: lab.id });
      navigate(`/inventory-counts/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start inventory count');
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Inventory Counts</h1>
        <button
          onClick={startNew}
          disabled={creating || labs.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          + New Inventory Count
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {labs.length === 0 && (
        <p className="text-sm text-slate-500">No approved laboratories available yet.</p>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Laboratory</th>
              {isAdmin && <th className="px-4 py-2 text-left font-medium">Department</th>}
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
                    {count.laboratory_name}
                  </Link>
                </td>
                {isAdmin && <td className="px-4 py-3 text-slate-600">{count.department_name}</td>}
                <td className="px-4 py-3 text-slate-600">{count.prepared_by}</td>
                <td className="px-4 py-3 text-slate-600">{count.item_count}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold rounded-full px-2 py-1 ${STATUS_STYLES[count.status]}`}>
                    {count.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{count.created_at?.slice(0, 10)}</td>
              </tr>
            ))}
            {counts.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-6 text-center text-slate-400">
                  No inventory counts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

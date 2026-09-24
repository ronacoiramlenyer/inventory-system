import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { StatusChip } from '../utils/inventoryStatus.jsx';

// The list of completed inventory periods. Everything here is frozen: these
// rows come from inventory_archives, not from the live sheets, so a later
// stock movement can't change what a closed period says it counted.
export default function InventoryArchive() {
  const [archives, setArchives] = useState(null);

  useEffect(() => {
    api.get('/inventory-archives').then((res) => setArchives(res.data));
  }, []);

  if (!archives) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Inventory Archive</h1>
        <p className="text-sm text-slate-500 mt-1">
          Completed inventory periods (F-LAB-010). Quantities here are frozen as of closing and are the
          record an audit is traced against.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Period</th>
              <th className="px-4 py-2 text-left font-medium">Inventory Ref.</th>
              <th className="px-4 py-2 text-left font-medium">Laboratory</th>
              <th className="px-4 py-2 text-left font-medium">Date Conducted</th>
              <th className="px-4 py-2 text-left font-medium">Date Closed</th>
              <th className="px-4 py-2 text-right font-medium">Items</th>
              <th className="px-4 py-2 text-right font-medium">Variances</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {archives.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">
                  <Link to={`/inventory-archive/${a.id}`} className="text-emerald-700 hover:underline">
                    {a.period_label || a.inventory_date}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{a.reference_no}</td>
                <td className="px-4 py-3 text-slate-600">{a.laboratory_name}</td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{a.inventory_date}</td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{a.closed_at?.slice(0, 10)}</td>
                <td className="px-4 py-3 text-right text-slate-600">{a.item_count}</td>
                <td className={`px-4 py-3 text-right ${a.variance_count ? 'text-amber-700 font-medium' : 'text-slate-400'}`}>
                  {a.variance_count}
                </td>
                <td className="px-4 py-3">
                  <StatusChip status="closed" />
                </td>
              </tr>
            ))}
            {archives.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  No inventory period has been closed yet. Closing one from a laboratory's Inventory Sheet
                  archives it here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

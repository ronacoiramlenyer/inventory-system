import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/dashboard/summary')
      .then((res) => setSummary(res.data))
      .catch(() => setError('Failed to load dashboard'));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!summary) return <p className="text-slate-500">Loading…</p>;

  const stats = [
    { label: 'Laboratories', value: summary.laboratoryCount },
    { label: 'Items Tracked', value: summary.itemCount },
    { label: 'Total Transactions', value: summary.transactionCount },
    { label: 'Low Stock Items', value: summary.lowStockItems.length, warn: summary.lowStockItems.length > 0 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.warn ? 'text-red-600' : 'text-slate-800'}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-200 font-semibold text-slate-700">
            Laboratories
          </div>
          <ul className="divide-y divide-slate-100">
            {summary.perLab.map((lab) => (
              <li key={lab.id} className="px-4 py-3 flex justify-between text-sm">
                <div>
                  <p className="font-medium text-slate-800">{lab.name}</p>
                  <p className="text-slate-500">{lab.department}</p>
                </div>
                <span className="text-slate-600">{lab.item_count} items</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-200 font-semibold text-slate-700">
            Low Stock Alerts
          </div>
          {summary.lowStockItems.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">Nothing below reorder level.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {summary.lowStockItems.map((item) => (
                <li key={item.id} className="px-4 py-3 flex justify-between items-center text-sm">
                  <div>
                    <Link to={`/items/${item.id}`} className="font-medium text-emerald-700 hover:underline">
                      {item.item_name}
                    </Link>
                    <p className="text-slate-500">{item.laboratory_name}</p>
                  </div>
                  <span className="text-red-600 font-semibold">
                    {item.current_balance} / {item.reorder_level} {item.unit_of_measure}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-200 font-semibold text-slate-700">
          Recent Transactions
        </div>
        {summary.recentTransactions.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">No transactions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Lab</th>
                <th className="px-4 py-2 font-medium text-right">IN</th>
                <th className="px-4 py-2 font-medium text-right">OUT</th>
                <th className="px-4 py-2 font-medium">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.recentTransactions.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2">{t.entry_date}</td>
                  <td className="px-4 py-2">{t.item_name}</td>
                  <td className="px-4 py-2 text-slate-500">{t.laboratory_name}</td>
                  <td className="px-4 py-2 text-right text-emerald-700">{t.in_qty || ''}</td>
                  <td className="px-4 py-2 text-right text-red-700">{t.out_qty || ''}</td>
                  <td className="px-4 py-2 text-slate-500">{t.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

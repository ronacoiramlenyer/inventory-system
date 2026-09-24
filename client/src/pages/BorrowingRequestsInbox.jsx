import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

const STATUS_STYLES = {
  Pending: 'bg-amber-100 text-amber-700',
  Approved: 'bg-sky-100 text-sky-700',
  Returned: 'bg-emerald-100 text-emerald-700',
};

export default function BorrowingRequestsInbox() {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    api.get('/borrowing-requests').then((res) => setRequests(res.data));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">
        <span className="font-mono text-slate-500 mr-2">R-LAB-108</span>Borrowing Request Form (BRF)
      </h1>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Borrower</th>
              <th className="px-4 py-2 text-left font-medium">Laboratory</th>
              <th className="px-4 py-2 text-left font-medium">Department/Unit</th>
              <th className="px-4 py-2 text-left font-medium">Date Needed</th>
              <th className="px-4 py-2 text-left font-medium">Return Date</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium">
                  <Link to={`/borrowing-requests/${r.id}`} className="text-emerald-700 hover:underline">
                    {r.borrower_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.laboratory_name}</td>
                <td className="px-4 py-3 text-slate-600">{r.department_unit}</td>
                <td className="px-4 py-3 text-slate-600">{r.date_needed}</td>
                <td className="px-4 py-3 text-slate-600">{r.return_date}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold rounded-full px-2 py-1 ${STATUS_STYLES[r.status] || ''}`}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No borrowing requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

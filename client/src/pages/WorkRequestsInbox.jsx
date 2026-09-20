import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUS_STYLES = {
  Pending: 'bg-amber-100 text-amber-700',
  Filed: 'bg-indigo-100 text-indigo-700',
  'In Progress': 'bg-sky-100 text-sky-700',
  Completed: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-red-100 text-red-700',
};

export default function WorkRequestsInbox() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    api.get('/work-requests').then((res) => setRequests(res.data));
  }, []);

  // A Secretary only ever sees Filed-or-later requests (the backend itself
  // excludes Pending for that role), so the page really is just "filed"
  // ones for her. A Subject Coordinator/admin gets everything back, Pending
  // included -- that's the whole point, since Pending is exactly what
  // needs their approval -- so the heading shouldn't call it "Filed" only.
  const heading = user.role === 'secretary' ? 'Filed Equipment Work Requests' : 'Equipment Work Requests';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">{heading}</h1>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Request No.</th>
              <th className="px-4 py-2 text-left font-medium">Laboratory</th>
              <th className="px-4 py-2 text-left font-medium">Equipment</th>
              <th className="px-4 py-2 text-left font-medium">Nature of Request</th>
              <th className="px-4 py-2 text-left font-medium">Date Needed</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium">
                  <Link to={`/work-requests/${r.id}`} className="text-emerald-700 hover:underline">
                    {r.request_no}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.laboratory_name}</td>
                <td className="px-4 py-3 text-slate-600">{r.equipment_name_description}</td>
                <td className="px-4 py-3 text-slate-600">{r.nature_of_request}</td>
                <td className="px-4 py-3 text-slate-600">{r.date_needed}</td>
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
                  No filed requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

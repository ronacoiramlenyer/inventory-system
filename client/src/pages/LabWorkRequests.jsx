import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import LabFormTabs from '../components/LabFormTabs';
import { PrintHeaderRow, PrintFooter, estimatePageLabel } from '../components/PrintHeaderFooter';
import { padRows } from '../utils/padRows';

// A printed page realistically fits ~10 rows of this table once the
// browser's own print margins/header/footer are accounted for.
const MIN_ROWS = 10;

const STATUS_STYLES = {
  Pending: 'bg-amber-100 text-amber-700',
  Filed: 'bg-indigo-100 text-indigo-700',
  Approved: 'bg-sky-100 text-sky-700',
  'In Progress': 'bg-sky-100 text-sky-700',
  Completed: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-red-100 text-red-700',
};

export default function LabWorkRequests() {
  const { id } = useParams();
  const { user } = useAuth();
  const [lab, setLab] = useState(null);
  const [requests, setRequests] = useState([]);

  function loadRequests() {
    api.get('/work-requests', { params: { laboratory_id: id } }).then((res) => setRequests(res.data));
  }

  useEffect(() => {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Temporary: lets an admin clean up a bad/duplicate entry directly from
  // the log, since there's no other way to remove one yet.
  async function handleDelete(requestId) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    await api.delete(`/work-requests/${requestId}`);
    loadRequests();
  }

  if (!lab) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to Laboratories
        </Link>
        <div className="space-x-2">
          <Link
            to={`/laboratories/${id}/work-requests/new`}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            + New Request
          </Link>
          <button
            onClick={() => window.print()}
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Print
          </button>
        </div>
      </div>

      <LabFormTabs laboratoryId={id} active="equipment-monitoring-sheet" />

      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden print:border-none print:rounded-none">
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Equipment Monitoring Sheet (EMS)</h2>
          <p className="text-sm text-slate-500 mb-3">
            <span className="font-semibold">Laboratory:</span> {lab.name}
          </p>

          <table className="w-full text-sm border-collapse">
            <thead>
              <PrintHeaderRow
                pageLabel={estimatePageLabel(Math.max(requests.length, MIN_ROWS), MIN_ROWS)}
                colSpan={9}
              />
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">
                  Request No.
                  <br />
                  (EWR-YYYY-###)
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Equipment Name</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Equipment ID</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Nature of Request</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Date Requested</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Date Needed</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Status</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Date Completed</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Remarks</th>
                {user.role === 'admin' && (
                  <th className="border border-slate-300 px-3 py-2 no-print w-16">&nbsp;</th>
                )}
              </tr>
            </thead>
            <tbody>
              {padRows(requests, MIN_ROWS).map((r) => (
                <tr key={r.id}>
                  <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">
                    {r.__blank ? null : (
                      <Link to={`/work-requests/${r.id}`} className="text-emerald-700 hover:underline">
                        {r.request_no}
                      </Link>
                    )}
                  </td>
                  <td className="border border-slate-300 px-3 py-2">{r.equipment_name_description}</td>
                  <td className="border border-slate-300 px-3 py-2">{r.serial_number}</td>
                  <td className="border border-slate-300 px-3 py-2">{r.nature_of_request}</td>
                  <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{r.date_requested}</td>
                  <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{r.date_needed}</td>
                  <td className="border border-slate-300 px-3 py-2">
                    {!r.__blank && (
                      <span className={`text-xs font-semibold rounded-full px-2 py-1 ${STATUS_STYLES[r.status] || ''}`}>
                        {r.status}
                      </span>
                    )}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{r.date_completed}</td>
                  <td className="border border-slate-300 px-3 py-2">{r.remarks}</td>
                  {user.role === 'admin' && (
                    <td className="border border-slate-300 px-3 py-2 no-print text-center">
                      {!r.__blank && (
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="text-slate-400 hover:text-red-600 text-xs underline"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <PrintFooter code="F-LAB-005" date="04-01-25" />
        </div>
      </div>
    </div>
  );
}

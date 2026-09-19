import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import LabFormTabs from '../components/LabFormTabs';

function formatIncidentDatetime(value) {
  if (!value) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function LabIncidentReports() {
  const { id } = useParams();
  const { user } = useAuth();
  const confirmDialog = useConfirm();
  const [lab, setLab] = useState(null);
  const [reports, setReports] = useState([]);

  function loadReports() {
    api.get('/incident-reports', { params: { laboratory_id: id } }).then((res) => setReports(res.data));
  }

  useEffect(() => {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Temporary: lets an admin clean up a bad/duplicate entry directly from
  // the log, since there's no other way to remove one yet.
  async function handleDelete(reportId) {
    if (!(await confirmDialog('Delete this entry? This cannot be undone.'))) return;
    await api.delete(`/incident-reports/${reportId}`);
    loadReports();
  }

  if (!lab) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to Laboratories
        </Link>
        <Link
          to={`/laboratories/${id}/incident-reports/new`}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          + New Report
        </Link>
      </div>

      <LabFormTabs laboratoryId={id} active="incident-report" />

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Reference No.</th>
              <th className="px-4 py-2 text-left font-medium">Date & Time</th>
              <th className="px-4 py-2 text-left font-medium">Class</th>
              <th className="px-4 py-2 text-left font-medium">Teacher</th>
              <th className="px-4 py-2 text-left font-medium">Type of Incident</th>
              <th className="px-4 py-2 text-left font-medium">Prepared by</th>
              {user.role === 'admin' && <th className="px-4 py-2 w-16"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reports.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium">
                  <Link to={`/incident-reports/${r.id}`} className="text-emerald-700 hover:underline">
                    {r.reference_no}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{formatIncidentDatetime(r.incident_datetime)}</td>
                <td className="px-4 py-3 text-slate-600">{r.class_name}</td>
                <td className="px-4 py-3 text-slate-600">{r.teacher}</td>
                <td className="px-4 py-3 text-slate-600">
                  {[r.incident_types, r.incident_type_other].filter(Boolean).join(', ')}
                </td>
                <td className="px-4 py-3 text-slate-600">{r.prepared_by}</td>
                {user.role === 'admin' && (
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="text-slate-400 hover:text-red-600 text-xs underline"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {reports.length === 0 && (
              <tr>
                <td colSpan={user.role === 'admin' ? 7 : 6} className="px-4 py-6 text-center text-slate-400">
                  No incident reports yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

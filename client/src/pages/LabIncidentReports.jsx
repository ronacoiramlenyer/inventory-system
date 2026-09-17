import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
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
  const [lab, setLab] = useState(null);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
    api.get('/incident-reports', { params: { laboratory_id: id } }).then((res) => setReports(res.data));
  }, [id]);

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
              </tr>
            ))}
            {reports.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
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

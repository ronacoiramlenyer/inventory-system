import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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

export default function IncidentReportDetail() {
  const { id } = useParams();
  const [report, setReport] = useState(null);

  useEffect(() => {
    api.get(`/incident-reports/${id}`).then((res) => setReport(res.data));
  }, [id]);

  if (!report) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link
          to={`/laboratories/${report.laboratory_id}/incident-reports`}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Back to {report.laboratory_name}
        </Link>
        <button
          onClick={() => window.print()}
          className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          Print
        </button>
      </div>

      <LabFormTabs laboratoryId={report.laboratory_id} active="incident-report" />

      <div className="bg-white border border-slate-300 rounded-xl p-6 max-w-2xl print:border-none print:rounded-none">
        <h2 className="text-lg font-bold text-slate-800 text-center mb-4">Laboratory Incident Report (LIR)</h2>

        <table className="w-full text-sm border-collapse mb-4">
          <tbody>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 w-56">
                Date & Time of Incident:
              </td>
              <td className="border border-slate-300 px-3 py-1.5">{formatIncidentDatetime(report.incident_datetime)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Class:</td>
              <td className="border border-slate-300 px-3 py-1.5">{report.class_name}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Teacher:</td>
              <td className="border border-slate-300 px-3 py-1.5">{report.teacher}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Laboratory:</td>
              <td className="border border-slate-300 px-3 py-1.5">{report.laboratory_name}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Type of Incident:</td>
              <td className="border border-slate-300 px-3 py-1.5">
                {[report.incident_types, report.incident_type_other].filter(Boolean).join(', ') || '—'}
              </td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">
                Individuals Involved:
              </td>
              <td className="border border-slate-300 px-3 py-1.5 whitespace-pre-wrap">
                {report.individuals_involved}
              </td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">
                Detailed Description of the Incident:
              </td>
              <td className="border border-slate-300 px-3 py-1.5 whitespace-pre-wrap">
                {report.detailed_description}
              </td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">
                Immediate Actions Taken:
              </td>
              <td className="border border-slate-300 px-3 py-1.5 whitespace-pre-wrap">
                {report.immediate_actions_taken}
              </td>
            </tr>
          </tbody>
        </table>

        <p className="text-sm text-slate-600">Prepared by: {report.prepared_by}</p>
        {report.designation && <p className="text-sm text-slate-500">{report.designation}</p>}
      </div>
    </div>
  );
}

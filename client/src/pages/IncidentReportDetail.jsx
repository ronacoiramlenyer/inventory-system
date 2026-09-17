import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import LabFormTabs from '../components/LabFormTabs';

const INCIDENT_TYPES = ['Injury', 'Chemical Spill', 'Fire', 'Equipment Damage', 'Biological Hazard', 'Electrical Issue'];

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

  const selectedTypes = report.incident_types ? report.incident_types.split(', ') : [];

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
        <h2 className="text-lg font-bold text-slate-800 mb-1">Laboratory Incident Report (LIR)</h2>
        <p className="text-sm text-slate-600 mb-4">Reference No.: {report.reference_no || '—'}</p>

        <table className="w-full text-sm border-collapse">
          <tbody>
            <tr>
              <td rowSpan={4} className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 align-top w-32">
                General Information
              </td>
              <td className="border border-slate-300 px-3 py-1.5 font-medium w-48">Date &amp; Time of Incident:</td>
              <td className="border border-slate-300 px-3 py-1.5">{formatIncidentDatetime(report.incident_datetime)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-medium">Class:</td>
              <td className="border border-slate-300 px-3 py-1.5">{report.class_name}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-medium">Teacher:</td>
              <td className="border border-slate-300 px-3 py-1.5">{report.teacher}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-medium">Laboratory:</td>
              <td className="border border-slate-300 px-3 py-1.5">{report.laboratory_name}</td>
            </tr>

            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 align-top">
                Type of Incident
              </td>
              <td colSpan={2} className="border border-slate-300 px-3 py-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {INCIDENT_TYPES.map((type) => (
                    <span key={type}>
                      {selectedTypes.includes(type) ? '☑' : '☐'} {type}
                    </span>
                  ))}
                  <span>
                    {report.incident_type_other ? '☑' : '☐'} Others: {report.incident_type_other}
                  </span>
                </div>
              </td>
            </tr>

            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 align-top">
                Individuals Involved:
                <br />
                (Name / Grade-Section)
              </td>
              <td colSpan={2} className="border border-slate-300 px-3 py-2 whitespace-pre-wrap align-top min-h-16">
                {report.individuals_involved}
              </td>
            </tr>

            <tr>
              <td colSpan={3} className="border border-slate-300 px-3 py-2 align-top">
                <p className="font-semibold mb-2">Detailed Description of the Incident:</p>
                <p className="whitespace-pre-wrap min-h-16">{report.detailed_description}</p>
              </td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-sm border-collapse mt-4">
          <tbody>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 align-top w-32">
                Immediate Actions Taken
              </td>
              <td className="border border-slate-300 px-3 py-2 whitespace-pre-wrap align-top min-h-16">
                {report.immediate_actions_taken}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 text-sm text-slate-700">
          <p>Prepared by:</p>
          <p className="mt-6 mb-1 w-56 border-b border-slate-400 pb-0.5">{report.prepared_by}</p>
          <p className="text-slate-500">{report.designation}</p>
        </div>
      </div>
    </div>
  );
}

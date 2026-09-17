import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import LabFormTabs from '../components/LabFormTabs';
import { PrintHeader, PrintFooter, estimatePageLabel } from '../components/PrintHeaderFooter';
import { padRows } from '../utils/padRows';

const SERVICE_OPTIONS = ['Preventive', 'Repair', 'Calibration'];
// A printed page realistically fits ~10 rows of this table once the
// browser's own print margins/header/footer are accounted for -- pad to
// (and estimate against) that instead of a generous guess that undercounts
// real pages.
const MIN_ROWS = 10;

const emptyForm = {
  entry_date: new Date().toISOString().slice(0, 10),
  service_performed: SERVICE_OPTIONS[0],
  request_id: '',
  status: '',
  logged_by: '',
};

export default function EquipmentMonitoringRecord() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  function loadLogs() {
    api.get(`/equipment/${id}/logs`).then((res) => setLogs(res.data));
  }

  useEffect(() => {
    api.get(`/equipment/${id}`).then((res) => setItem(res.data));
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/equipment/${id}/logs`, form);
      setShowForm(false);
      setForm(emptyForm);
      loadLogs();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save entry');
    }
  }

  async function handleDeleteLog(logId) {
    if (!confirm('Delete this entry?')) return;
    await api.delete(`/equipment/${id}/logs/${logId}`);
    loadLogs();
  }

  if (!item) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link
          to={`/laboratories/${item.laboratory_id}/equipment`}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Back to {item.laboratory_name}
        </Link>
        <div className="space-x-2">
          <button
            onClick={() => setShowForm((s) => !s)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            + Add Entry
          </button>
          <button
            onClick={() => window.print()}
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Print
          </button>
        </div>
      </div>

      <LabFormTabs laboratoryId={item.laboratory_id} active="equipment-monitoring-record" />

      {error && <p className="text-sm text-red-600 no-print">{error}</p>}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="no-print bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-3"
        >
          <div>
            <label className="block text-sm text-slate-600 mb-1">Date</label>
            <input
              type="date"
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.entry_date}
              onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Service Performed</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.service_performed}
              onChange={(e) => setForm({ ...form, service_performed: e.target.value })}
            >
              {SERVICE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Request ID (EWR)</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.request_id}
              onChange={(e) => setForm({ ...form, request_id: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Status</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              placeholder="e.g. Completed"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Logged By</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.logged_by}
              onChange={(e) => setForm({ ...form, logged_by: e.target.value })}
              placeholder="Signature name"
            />
          </div>
          <div className="col-span-full flex gap-2">
            <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2">
              Save Entry
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden print:border-none print:rounded-none">
        <div className="p-6">
          <PrintHeader pageLabel={estimatePageLabel(Math.max(logs.length, MIN_ROWS), MIN_ROWS)} />
          <h2 className="text-lg font-bold text-slate-800 mb-4">Equipment Monitoring Record (EMR)</h2>
          <table className="mb-4 text-sm w-full border-collapse">
            <tbody>
              <tr>
                <td
                  rowSpan={3}
                  className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 align-top w-32"
                >
                  Equipment Information
                </td>
                <td className="border border-slate-300 px-3 py-1.5 font-medium w-64">
                  Equipment Name &amp; Description:
                </td>
                <td className="border border-slate-300 px-3 py-1.5">{item.name_description}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-medium">Equipment ID/Serial Number:</td>
                <td className="border border-slate-300 px-3 py-1.5">{item.serial_number}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-medium">Location:</td>
                <td className="border border-slate-300 px-3 py-1.5">{item.location}</td>
              </tr>
            </tbody>
          </table>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Date</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">
                  Service Performed (Preventive, Repair, Calibration)
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">
                  Request ID (referenced to EWR)
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">
                  Status (on repair, on loan, …)
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Logged by</th>
                <th className="border border-slate-300 px-3 py-2 no-print w-16">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {padRows(logs, MIN_ROWS).map((log) => (
                <tr key={log.id}>
                  <td className="border border-slate-300 px-3 py-2">{log.entry_date}</td>
                  <td className="border border-slate-300 px-3 py-2">{log.service_performed}</td>
                  <td className="border border-slate-300 px-3 py-2">{log.request_id}</td>
                  <td className="border border-slate-300 px-3 py-2">{log.status}</td>
                  <td className="border border-slate-300 px-3 py-2">{log.logged_by}</td>
                  <td className="border border-slate-300 px-3 py-2 no-print text-center">
                    {!log.__blank && (
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        className="text-slate-400 hover:text-red-600 text-xs underline"
                      >
                        remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <PrintFooter code="F-LAB-001" date="04-01-25" />
        </div>
      </div>
    </div>
  );
}

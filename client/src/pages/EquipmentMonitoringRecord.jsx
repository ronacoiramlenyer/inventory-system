import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useConfirm } from '../context/ConfirmContext';
import LabFormTabs from '../components/LabFormTabs';
import { PrintHeaderRow, PrintTitleRow, PrintFooter, estimatePageLabel } from '../components/PrintHeaderFooter';
import { padRows } from '../utils/padRows';

const SERVICE_OPTIONS = ['Preventive', 'Repair', 'Calibration'];
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
  const confirmDialog = useConfirm();
  const [item, setItem] = useState(null);
  const [instances, setInstances] = useState([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const selectedInstance = instances.find((i) => i.id === selectedInstanceId);

  useEffect(() => {
    Promise.all([
      api.get(`/items/${id}`),
      api.get(`/equipment-instances/item/${id}`),
    ]).then(([itemRes, instancesRes]) => {
      setItem(itemRes.data);
      setInstances(instancesRes.data);
      if (instancesRes.data.length > 0) {
        setSelectedInstanceId(instancesRes.data[0].id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!selectedInstanceId) return;
    api.get(`/equipment-instances/${selectedInstanceId}/logs`)
      .then((res) => setLogs(res.data))
      .catch(() => setLogs([]));
  }, [selectedInstanceId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!selectedInstanceId) {
      setError('Please select an equipment unit first');
      return;
    }
    try {
      await api.post(`/equipment-instances/${selectedInstanceId}/logs`, form);
      setShowForm(false);
      setForm(emptyForm);
      const res = await api.get(`/equipment-instances/${selectedInstanceId}/logs`);
      setLogs(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save entry');
    }
  }

  async function handleDeleteLog(logId) {
    if (!(await confirmDialog('Delete this entry?'))) return;
    try {
      await api.delete(`/equipment-instances/${selectedInstanceId}/logs/${logId}`);
      const res = await api.get(`/equipment-instances/${selectedInstanceId}/logs`);
      setLogs(res.data);
    } catch (err) {
      setError('Failed to delete entry');
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!item) return <p className="text-red-600">Equipment item not found</p>;
  if (instances.length === 0) {
    return (
      <div className="space-y-4">
        <Link
          to={`/laboratories/${item.laboratory_id}/stock-cards`}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Back to {item.laboratory_name}
        </Link>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <p className="text-sm text-amber-900">
            No units recorded yet for {item.item_name}. Inventory counts this item in bulk, so each physical
            unit has to be listed with its serial number before it can have its own service record.
          </p>
          <Link
            to={`/items/${item.id}`}
            className="inline-block bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Add units on the Stock Card →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link
          to={`/laboratories/${item.laboratory_id}/stock-cards`}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Back to {item.laboratory_name}
        </Link>
        <div className="space-x-2">
          <button
            onClick={() => setShowForm((s) => !s)}
            disabled={!selectedInstanceId}
            className="disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
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

      {/* Equipment Units Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 no-print">
        <label className="block text-sm font-medium text-slate-700 mb-2">Select Equipment Unit</label>
        <select
          value={selectedInstanceId || ''}
          onChange={(e) => setSelectedInstanceId(Number(e.target.value))}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        >
          {instances.map((inst) => (
            <option key={inst.id} value={inst.id}>
              SN: {inst.serial_number} • Location: {inst.location || '(Not set)'} • Status: {inst.status || 'Active'}
            </option>
          ))}
        </select>
      </div>

      {showForm && selectedInstance && (
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

      {selectedInstance && (
        <div className="bg-white border border-slate-300 rounded-xl overflow-hidden print:border-none print:rounded-none">
          <div className="p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 print:hidden">Equipment Monitoring Record (EMR)</h2>

            <table className="w-full text-sm print:text-xs border-collapse table-fixed">
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[24%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[14%]" />
                <col className="w-[10%] no-print" />
              </colgroup>
              <thead>
                <PrintHeaderRow
                  pageLabel={estimatePageLabel(Math.max(logs.length, MIN_ROWS), MIN_ROWS)}
                  colSpan={6}
                />
                <PrintTitleRow title="Equipment Monitoring Record (EMR)" colSpan={6} />
                <tr>
                  <td
                    rowSpan={3}
                    colSpan={1}
                    className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 align-top"
                  >
                    Equipment Information
                  </td>
                  <td colSpan={2} className="border border-slate-300 px-3 py-1.5 font-medium">
                    Equipment Name &amp; Description:
                  </td>
                  <td colSpan={3} className="border border-slate-300 px-3 py-1.5">
                    {item.item_name}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-slate-300 px-3 py-1.5 font-medium">
                    Equipment ID/Serial Number:
                  </td>
                  <td colSpan={3} className="border border-slate-300 px-3 py-1.5">
                    {selectedInstance.serial_number}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-slate-300 px-3 py-1.5 font-medium">
                    Location:
                  </td>
                  <td colSpan={3} className="border border-slate-300 px-3 py-1.5">
                    {selectedInstance.location}
                  </td>
                </tr>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Date</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">
                    Service Performed (Preventive, Repair, Calibration)
                  </th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">
                    Request ID (referenced to EWR)
                  </th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">
                    Status (on repair, on loan, …)
                  </th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Logged by</th>
                  <th className="border border-slate-300 px-3 py-2 no-print w-16">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {padRows(logs, MIN_ROWS).map((log) => (
                  <tr key={log.id}>
                    <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{log.entry_date}</td>
                    <td className="border border-slate-300 px-3 py-2">{log.service_performed}</td>
                    <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{log.request_id}</td>
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
      )}
    </div>
  );
}

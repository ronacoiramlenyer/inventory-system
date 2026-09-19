import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { useConfirm } from '../context/ConfirmContext';
import LabFormTabs from '../components/LabFormTabs';
import { PrintHeaderRow, PrintFooter, estimatePageLabel } from '../components/PrintHeaderFooter';
import { padRows } from '../utils/padRows';

// A printed page realistically fits ~10 rows of this table once the
// browser's own print margins/header/footer are accounted for.
const MIN_ROWS = 10;

const emptyForm = {
  turnover_date: new Date().toISOString().slice(0, 10),
  waste_description: '',
  waste_classification: '',
  quantity_volume: '',
  disposal_method: '',
  remarks: '',
  received_by: '',
  logged_by: '',
};

export default function LabWasteDisposalLog() {
  const { id } = useParams();
  const confirmDialog = useConfirm();
  const [lab, setLab] = useState(null);
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  function loadRows() {
    api.get('/waste-disposal-log', { params: { laboratory_id: id } }).then((res) => setRows(res.data));
  }

  useEffect(() => {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/waste-disposal-log', { ...form, laboratory_id: id });
      setForm(emptyForm);
      setShowForm(false);
      loadRows();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save entry');
    }
  }

  async function handleDelete(rowId) {
    if (!(await confirmDialog('Delete this entry?'))) return;
    await api.delete(`/waste-disposal-log/${rowId}`);
    loadRows();
  }

  if (!lab) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to Laboratories
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

      <LabFormTabs laboratoryId={id} active="waste-disposal-log" />

      {error && <p className="text-sm text-red-600 no-print">{error}</p>}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="no-print bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <div>
            <label className="block text-sm text-slate-600 mb-1">Date of Turnover</label>
            <input
              type="date"
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.turnover_date}
              onChange={(e) => setForm({ ...form, turnover_date: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Description of Waste</label>
            <input
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.waste_description}
              onChange={(e) => setForm({ ...form, waste_description: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Classification of Waste</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.waste_classification}
              onChange={(e) => setForm({ ...form, waste_classification: e.target.value })}
              placeholder="e.g. Biohazard, Chemical, Sharps"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Quantity / Volume</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.quantity_volume}
              onChange={(e) => setForm({ ...form, quantity_volume: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Disposal Method</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.disposal_method}
              onChange={(e) => setForm({ ...form, disposal_method: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Received by</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.received_by}
              onChange={(e) => setForm({ ...form, received_by: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Logged by</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.logged_by}
              onChange={(e) => setForm({ ...form, logged_by: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Remarks</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
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
          <h2 className="text-lg font-bold text-slate-800 mb-4 text-center">Waste Disposal Log</h2>
          <p className="text-sm text-slate-500 mb-3">
            <span className="font-semibold">Laboratory:</span> {lab.name}
          </p>

          <table className="w-full text-sm border-collapse">
            <thead>
              <PrintHeaderRow
                pageLabel={estimatePageLabel(Math.max(rows.length, MIN_ROWS), MIN_ROWS)}
                colSpan={8}
              />
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Date of Turnover</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Description of Waste</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">
                  Classification of Waste
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Quantity / Volume</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Disposal Method</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Remarks</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Received by</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Logged by</th>
                <th className="border border-slate-300 px-3 py-2 no-print w-16">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {padRows(rows, MIN_ROWS).map((row) => (
                <tr key={row.id}>
                  <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{row.turnover_date}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.waste_description}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.waste_classification}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.quantity_volume}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.disposal_method}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.remarks}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.received_by}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.logged_by}</td>
                  <td className="border border-slate-300 px-3 py-2 no-print text-center">
                    {!row.__blank && (
                      <button
                        onClick={() => handleDelete(row.id)}
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

          <PrintFooter code="F-LAB-008" date="04-01-25" />
        </div>
      </div>
    </div>
  );
}

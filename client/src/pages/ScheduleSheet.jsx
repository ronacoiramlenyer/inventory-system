import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import LabFormTabs from '../components/LabFormTabs';
import { PrintHeader, PrintFooter, estimatePageLabel } from '../components/PrintHeaderFooter';
import { padRows } from '../utils/padRows';

const MIN_ROWS = 10;

const emptyForm = {
  equipment_name_description: '',
  serial_number: '',
  frequency: '',
  department: '',
  location: '',
  scheduled_date: '',
  actual_date: '',
  remarks: '',
};

// Shared by F-LAB-002 Preventive Maintenance Schedule and F-LAB-003 Equipment
// Calibration Schedule -- identically shaped, only the noun differs.
export default function ScheduleSheet({ apiBase, tabKey, formTitle, dateNoun, code }) {
  const { id } = useParams();
  const [lab, setLab] = useState(null);
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  function loadRows() {
    api.get(`/${apiBase}`, { params: { laboratory_id: id } }).then((res) => setRows(res.data));
  }

  useEffect(() => {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
    api.get('/departments').then((res) => setDepartments(res.data));
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startNew() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      equipment_name_description: row.equipment_name_description,
      serial_number: row.serial_number || '',
      frequency: row.frequency || '',
      department: row.department || '',
      location: row.location || '',
      scheduled_date: row.scheduled_date || '',
      actual_date: row.actual_date || '',
      remarks: row.remarks || '',
    });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/${apiBase}/${editingId}`, form);
      } else {
        await api.post(`/${apiBase}`, { ...form, laboratory_id: id });
      }
      setShowForm(false);
      loadRows();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    }
  }

  async function handleDelete(rowId) {
    if (!confirm('Delete this schedule entry?')) return;
    await api.delete(`/${apiBase}/${rowId}`);
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
            onClick={startNew}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            + Add Row
          </button>
          <button
            onClick={() => window.print()}
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Print
          </button>
        </div>
      </div>

      <LabFormTabs laboratoryId={id} active={tabKey} />

      {error && <p className="text-sm text-red-600 no-print">{error}</p>}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="no-print bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <div className="col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Equipment Name & Description</label>
            <input
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.equipment_name_description}
              onChange={(e) => setForm({ ...form, equipment_name_description: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Equipment ID/Serial Number</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.serial_number}
              onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Frequency</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
              placeholder="e.g. Annual, Quarterly"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Department</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            >
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Location</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Scheduled Date of {dateNoun}</label>
            <input
              type="date"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.scheduled_date}
              onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
            />
          </div>
          {editingId && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">Actual Date of {dateNoun}</label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.actual_date}
                onChange={(e) => setForm({ ...form, actual_date: e.target.value })}
              />
            </div>
          )}
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
              Save
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
          <PrintHeader pageLabel={estimatePageLabel(Math.max(rows.length, MIN_ROWS), MIN_ROWS)} />
          <h2 className="text-lg font-bold text-slate-800 mb-4">{formTitle}</h2>
          <p className="text-sm text-slate-500 mb-3">
            <span className="font-semibold">Laboratory:</span> {lab.name}
          </p>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Item No.</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">
                  Equipment Name & Description
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">
                  Equipment ID/Serial Number
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Frequency</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Department</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Location</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">
                  Scheduled Date of {dateNoun}
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">
                  Actual Date of {dateNoun}
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Remarks</th>
                <th className="border border-slate-300 px-3 py-2 no-print w-24">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {padRows(rows, MIN_ROWS).map((row, i) => (
                <tr key={row.id}>
                  <td className="border border-slate-300 px-3 py-2">{i + 1}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.equipment_name_description}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.serial_number}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.frequency}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.department}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.location}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.scheduled_date}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.actual_date}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.remarks}</td>
                  <td className="border border-slate-300 px-3 py-2 no-print text-center space-x-2">
                    {!row.__blank && (
                      <>
                        <button onClick={() => startEdit(row)} className="text-slate-500 hover:text-slate-800 text-xs underline">
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="text-slate-400 hover:text-red-600 text-xs underline"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <PrintFooter code={code} date="04-01-25" />
        </div>
      </div>
    </div>
  );
}

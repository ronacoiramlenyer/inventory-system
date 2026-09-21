import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import LabFormTabs from '../components/LabFormTabs';
import { PrintHeaderRow, PrintTitleRow, PrintFooter } from '../components/PrintHeaderFooter';
import PrintPages from '../components/PrintPages';
import { padRows } from '../utils/padRows';

const MIN_ROWS = 10;

// How many dated entries a fresh schedule generates for a full year at
// each frequency -- picking "Monthly" for a new row creates 12 entries
// spaced a month apart starting from the date entered, not just one.
const FREQUENCY_COUNTS = {
  Weekly: 52,
  Monthly: 12,
  Quarterly: 4,
  'Semi-Annual': 2,
  Annual: 1,
};
const FREQUENCY_OPTIONS = Object.keys(FREQUENCY_COUNTS);

function occurrenceDate(baseDateStr, frequency, index) {
  const d = new Date(`${baseDateStr}T00:00:00`);
  if (frequency === 'Weekly') {
    d.setDate(d.getDate() + index * 7);
  } else {
    const count = FREQUENCY_COUNTS[frequency] || 1;
    d.setMonth(d.getMonth() + Math.round((index * 12) / count));
  }
  return d.toISOString().slice(0, 10);
}

const emptyForm = {
  equipment_item_id: '',
  equipment_record_id: '',
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
  const { user } = useAuth();
  const confirmDialog = useConfirm();
  const [lab, setLab] = useState(null);
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [equipmentUnits, setEquipmentUnits] = useState([]);
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
    api.get('/equipment', { params: { laboratory_id: id } }).then((res) => setEquipmentUnits(res.data));
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Serial and location are copied from the unit's F-LAB-001 record at the
  // moment it's picked, so a schedule that's already been printed and signed
  // keeps showing what it was filed against even if the 201 file is later
  // corrected.
  function selectEquipment(unitId) {
    const picked = equipmentUnits.find((u) => String(u.id) === unitId);
    setForm((f) => ({
      ...f,
      equipment_record_id: unitId,
      equipment_item_id: picked ? String(picked.item_id) : '',
      equipment_name_description: picked ? picked.name_description : '',
      serial_number: picked?.serial_number || '',
      location: picked?.location || '',
    }));
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      equipment_item_id: row.equipment_item_id ? String(row.equipment_item_id) : '',
      equipment_record_id: row.equipment_record_id ? String(row.equipment_record_id) : '',
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
        const count = FREQUENCY_COUNTS[form.frequency] || 1;
        if (count > 1 && !form.scheduled_date) {
          setError('Pick a starting date so the schedule can be generated.');
          return;
        }
        await Promise.all(
          Array.from({ length: count }, (_, i) =>
            api.post(`/${apiBase}`, {
              ...form,
              laboratory_id: id,
              scheduled_date: form.scheduled_date
                ? occurrenceDate(form.scheduled_date, form.frequency, i)
                : form.scheduled_date,
            })
          )
        );
      }
      setShowForm(false);
      loadRows();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    }
  }

  async function handleDelete(rowId) {
    if (!(await confirmDialog('Delete this schedule entry?'))) return;
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
          {(user.role === 'staff' || user.role === 'admin') && (
            <button
              onClick={startNew}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
            >
              + Add Row
            </button>
          )}
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
            <select
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.equipment_record_id}
              onChange={(e) => selectEquipment(e.target.value)}
            >
              <option value="" disabled>
                Select a unit from F-LAB-001…
              </option>
              {equipmentUnits
                .filter((u) => u.status === 'Active')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name_description} · {u.equipment_code}
                    {u.serial_number ? ` · ${u.serial_number}` : ' · no serial yet'}
                  </option>
                ))}
            </select>
            {equipmentUnits.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">
                No equipment units in this lab yet — add equipment on the Inventory Sheet first.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Equipment ID/Serial Number</label>
            <input
              readOnly
              className="w-full border border-slate-300 bg-slate-50 text-slate-600 rounded-lg px-3 py-2 text-sm"
              value={form.serial_number}
              placeholder="From the selected unit"
            />
            <p className="text-xs text-slate-400 mt-1">Comes from the unit's F-LAB-001 record.</p>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Frequency</label>
            <select
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            >
              <option value="" disabled>
                Select frequency…
              </option>
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
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
              readOnly
              className="w-full border border-slate-300 bg-slate-50 text-slate-600 rounded-lg px-3 py-2 text-sm"
              value={form.location}
              placeholder="From the selected unit"
            />
            <p className="text-xs text-slate-400 mt-1">Comes from the unit's F-LAB-001 record.</p>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              {editingId ? `Scheduled Date of ${dateNoun}` : `First Scheduled Date of ${dateNoun}`}
            </label>
            <input
              type="date"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.scheduled_date}
              onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
            />
            {!editingId && form.frequency && FREQUENCY_COUNTS[form.frequency] > 1 && (
              <p className="text-xs text-slate-400 mt-1">
                Creates {FREQUENCY_COUNTS[form.frequency]} entries for the year, spaced by frequency starting from
                this date.
              </p>
            )}
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
        <div className="p-6 print:hidden">
          <h2 className="text-lg font-bold text-slate-800 mb-4">{formTitle}</h2>
          <p className="text-sm text-slate-500 mb-3">
            <span className="font-semibold">Laboratory:</span> {lab.name}
          </p>

          {/* table-fixed + an explicit colgroup -- without it, the natural
              (auto) table layout sizes columns off cell content, and with
              nine fairly wordy columns the table's true width ran wider
              than its container. */}
          <table className="w-full text-sm border-collapse table-fixed">
            <colgroup>
              <col className="w-[6%]" />
              <col className="w-[13%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
              <col className="w-[9%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[15%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Item No.</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">
                  Equipment Name & Description
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">
                  Equipment ID/Serial Number
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Frequency</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Department</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Location</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">
                  Scheduled Date of {dateNoun}
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">
                  Actual Date of {dateNoun}
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Remarks</th>
                <th className="border border-slate-300 px-3 py-2 w-24">&nbsp;</th>
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
                  <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{row.scheduled_date}</td>
                  <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{row.actual_date}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.remarks}</td>
                  <td className="border border-slate-300 px-3 py-2 text-center space-x-2">
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
        </div>

        {/* Chrome has no way to tell a printed page its own page number, so
            a single table relying on the browser's native page breaks can
            never show a genuinely incrementing "Page 2 of N" -- every
            repeating header row is the same element with the same text on
            every page it lands on. Splitting the rows into fixed-size
            chunks ourselves and rendering each chunk as its own <table>,
            forced onto its own page, is the only way to give each page its
            own correct label. */}
        <PrintPages rows={rows} landscape minRows={MIN_ROWS} footer={<PrintFooter code={code} date="04-01-25" />}>
          {(pageRows, pageIndex, pageCount, startIndex) => (
            <table className="print-page w-full text-xs border-collapse table-fixed">
              <colgroup>
                <col className="w-[7%]" />
                <col className="w-[13%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
                <col className="w-[11%]" />
                <col className="w-[9%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[17%]" />
              </colgroup>
              <thead>
                <PrintHeaderRow pageLabel={`Page ${pageIndex + 1} of ${pageCount}`} colSpan={9} />
                <PrintTitleRow
                  title={formTitle}
                  subtitle={
                    <>
                      <span className="font-semibold">Laboratory:</span> {lab.name}
                    </>
                  }
                  colSpan={9}
                />
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Item No.</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">
                    Equipment Name & Description
                  </th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">
                    Equipment ID/Serial Number
                  </th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Frequency</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Department</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Location</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">
                    Scheduled Date of {dateNoun}
                  </th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">
                    Actual Date of {dateNoun}
                  </th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr key={row.id}>
                    <td className="border border-slate-300 px-3 py-2">{startIndex + i}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.equipment_name_description}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.serial_number}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.frequency}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.department}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.location}</td>
                    <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{row.scheduled_date}</td>
                    <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{row.actual_date}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PrintPages>
      </div>
    </div>
  );
}

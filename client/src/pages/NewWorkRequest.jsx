import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import LabFormTabs from '../components/LabFormTabs';

const NATURE_OPTIONS = ['Preventive', 'Repair', 'Calibration'];

export default function NewWorkRequest() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Arriving from the "Due from Schedule" list on the EMS page (a PMS/ECS
  // entry being filed as a real EWR) pre-fills the form from that entry and
  // carries its source_type/source_schedule_id through on submit, so the
  // same due date can't be filed twice -- see GET /work-requests/pending-schedule.
  const sourceType = searchParams.get('source_type');
  const sourceScheduleId = searchParams.get('source_schedule_id');
  const [lab, setLab] = useState(null);
  const [equipmentItems, setEquipmentItems] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    equipment_item_id: searchParams.get('equipment_item_id') || '',
    equipment_name_description: searchParams.get('equipment_name_description') || '',
    serial_number: searchParams.get('serial_number') || '',
    date_needed: searchParams.get('date_needed') || '',
    nature_of_request: searchParams.get('nature_of_request') || NATURE_OPTIONS[0],
    detailed_description: '',
    requested_by: user.full_name,
  });

  useEffect(() => {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
    api.get('/items', { params: { laboratory_id: id, category: 'Equipment' } }).then((res) => {
      setEquipmentItems(res.data);
      // Auto-match equipment by name if equipment_item_id is empty but
      // equipment_name_description is pre-filled from pending schedule sidebar
      const prefilledName = searchParams.get('equipment_name_description');
      const prefilledItemId = searchParams.get('equipment_item_id');
      if (prefilledName && !prefilledItemId) {
        const matched = res.data.find((it) => it.item_name === prefilledName);
        if (matched) {
          setForm((f) => ({
            ...f,
            equipment_item_id: String(matched.id),
            serial_number: matched.serial_number || f.serial_number,
          }));
        }
      }
    });
  }, [id, searchParams]);

  function selectEquipment(itemId) {
    const picked = equipmentItems.find((it) => String(it.id) === itemId);
    setForm((f) => ({
      ...f,
      equipment_item_id: itemId,
      equipment_name_description: picked ? picked.item_name : '',
      serial_number: picked?.serial_number || f.serial_number,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/work-requests', {
        ...form,
        laboratory_id: id,
        source_type: sourceType || undefined,
        source_schedule_id: sourceScheduleId || undefined,
      });
      navigate(`/work-requests/${data.id}`, {
        replace: true,
        state: { justSubmitted: true },
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request');
      setSubmitting(false);
    }
  }

  if (!lab) return <p className="text-slate-500">Loading…</p>;

  if (user.role !== 'staff' && user.role !== 'admin') {
    return (
      <div className="space-y-4">
        <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to Laboratories
        </Link>
        <p className="text-sm text-red-600">
          Only the lab custodian (staff) can file an Equipment Work Request for this laboratory.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to Laboratories
      </Link>

      <LabFormTabs laboratoryId={id} active="equipment-work-request" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {sourceType && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-2xl">
          Filing this from a due {sourceType === 'PMS' ? 'Preventive Maintenance' : 'Calibration'} schedule entry.
        </p>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-slate-300 rounded-xl p-6 space-y-4 max-w-2xl">
        <h2 className="text-lg font-bold text-slate-800 text-center">Equipment Work Request (EWR)</h2>
        <p className="text-sm text-slate-500 text-center">{lab.name}</p>

        <div>
          <label className="block text-sm text-slate-600 mb-1">Equipment Name & Description</label>
          <select
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={form.equipment_item_id}
            onChange={(e) => selectEquipment(e.target.value)}
          >
            <option value="" disabled>
              Select equipment from Inventory…
            </option>
            {equipmentItems.map((it) => (
              <option key={it.id} value={it.id}>
                {it.item_name}
              </option>
            ))}
          </select>
          {equipmentItems.length === 0 && (
            <p className="text-xs text-slate-400 mt-1">
              No equipment in this lab's Inventory yet — add one from the Inventory list first.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Equipment ID/Serial Number</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.serial_number}
              onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Date Needed</label>
            <input
              type="date"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.date_needed}
              onChange={(e) => setForm({ ...form, date_needed: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Nature of Request</label>
          <select
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={form.nature_of_request}
            onChange={(e) => setForm({ ...form, nature_of_request: e.target.value })}
          >
            {NATURE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Detailed Description of Request</label>
          <textarea
            rows={4}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={form.detailed_description}
            onChange={(e) => setForm({ ...form, detailed_description: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Requested by</label>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={form.requested_by}
            onChange={(e) => setForm({ ...form, requested_by: e.target.value })}
          />
        </div>

        <div className="flex gap-2">
          <button
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            {submitting ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </form>
    </div>
  );
}

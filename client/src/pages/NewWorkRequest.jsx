import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import LabFormTabs from '../components/LabFormTabs';

const NATURE_OPTIONS = ['Preventive', 'Repair', 'Calibration'];

export default function NewWorkRequest() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lab, setLab] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    equipment_name_description: '',
    serial_number: '',
    date_needed: '',
    nature_of_request: NATURE_OPTIONS[0],
    detailed_description: '',
    requested_by: user.full_name,
  });

  useEffect(() => {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/work-requests', { ...form, laboratory_id: id });
      navigate(`/work-requests/${data.id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request');
    }
  }

  if (!lab) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to Laboratories
      </Link>

      <LabFormTabs laboratoryId={id} active="equipment-work-request" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={handleSubmit} className="bg-white border border-slate-300 rounded-xl p-6 space-y-4 max-w-2xl">
        <h2 className="text-lg font-bold text-slate-800 text-center">Equipment Work Request (EWR)</h2>
        <p className="text-sm text-slate-500 text-center">{lab.name}</p>

        <div>
          <label className="block text-sm text-slate-600 mb-1">Equipment Name & Description</label>
          <input
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={form.equipment_name_description}
            onChange={(e) => setForm({ ...form, equipment_name_description: e.target.value })}
          />
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
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2">
            Submit Request
          </button>
        </div>
      </form>
    </div>
  );
}

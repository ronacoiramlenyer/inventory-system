import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import LabFormTabs from '../components/LabFormTabs';

const INCIDENT_TYPES = ['Injury', 'Chemical Spill', 'Fire', 'Equipment Damage', 'Biological Hazard', 'Electrical Issue'];

export default function NewIncidentReport() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [form, setForm] = useState({
    incident_datetime: '',
    class_name: '',
    teacher: '',
    incident_type_other: '',
    individuals_involved: '',
    detailed_description: '',
    immediate_actions_taken: '',
    prepared_by: user.full_name,
    designation: '',
  });

  function toggleType(type) {
    setSelectedTypes((types) => (types.includes(type) ? types.filter((t) => t !== type) : [...types, type]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/incident-reports', {
        ...form,
        laboratory_id: id,
        incident_types: selectedTypes,
      });
      navigate(`/incident-reports/${data.id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit report');
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to Laboratories
      </Link>

      <LabFormTabs laboratoryId={id} active="incident-report" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={handleSubmit} className="bg-white border border-slate-300 rounded-xl p-6 space-y-4 max-w-2xl">
        <h2 className="text-lg font-bold text-slate-800 text-center">Laboratory Incident Report (LIR)</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Date & Time of Incident</label>
            <input
              type="datetime-local"
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.incident_datetime}
              onChange={(e) => setForm({ ...form, incident_datetime: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Class</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.class_name}
              onChange={(e) => setForm({ ...form, class_name: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Teacher</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.teacher}
              onChange={(e) => setForm({ ...form, teacher: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-600 mb-2">Type of Incident</label>
          <div className="grid grid-cols-2 gap-2">
            {INCIDENT_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={selectedTypes.includes(type)} onChange={() => toggleType(type)} />
                {type}
              </label>
            ))}
          </div>
          <div className="mt-2">
            <label className="block text-sm text-slate-600 mb-1">Others</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.incident_type_other}
              onChange={(e) => setForm({ ...form, incident_type_other: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-600 mb-1">Individuals Involved (Name / Grade-Section)</label>
          <textarea
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={form.individuals_involved}
            onChange={(e) => setForm({ ...form, individuals_involved: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm text-slate-600 mb-1">Detailed Description of the Incident</label>
          <textarea
            rows={4}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={form.detailed_description}
            onChange={(e) => setForm({ ...form, detailed_description: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm text-slate-600 mb-1">Immediate Actions Taken</label>
          <textarea
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={form.immediate_actions_taken}
            onChange={(e) => setForm({ ...form, immediate_actions_taken: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Prepared by (Name / Signature)</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.prepared_by}
              onChange={(e) => setForm({ ...form, prepared_by: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Designation</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
            />
          </div>
        </div>

        <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2">
          Submit Report
        </button>
      </form>
    </div>
  );
}

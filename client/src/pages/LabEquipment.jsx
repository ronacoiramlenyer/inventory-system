import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { useConfirm } from '../context/ConfirmContext';
import LabFormTabs from '../components/LabFormTabs';

const emptyForm = { name_description: '', serial_number: '', location: '' };

export default function LabEquipment() {
  const { id } = useParams();
  const confirmDialog = useConfirm();
  const [lab, setLab] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  function loadEquipment() {
    api.get('/equipment', { params: { laboratory_id: id } }).then((res) => setEquipment(res.data));
  }

  useEffect(() => {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
    loadEquipment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/equipment', { ...form, laboratory_id: id });
      setForm(emptyForm);
      setShowForm(false);
      loadEquipment();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save equipment');
    }
  }

  async function handleDelete(equipmentId) {
    if (!(await confirmDialog('Delete this equipment and its monitoring record?'))) return;
    await api.delete(`/equipment/${equipmentId}`);
    loadEquipment();
  }

  if (!lab) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to Laboratories
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-800">{lab.name}</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          + Add Equipment
        </button>
      </div>

      <LabFormTabs laboratoryId={id} active="equipment-monitoring-record" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 max-w-xl">
          <h3 className="font-semibold text-slate-700">New Equipment</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm text-slate-600 mb-1">Equipment Name & Description</label>
              <input
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.name_description}
                onChange={(e) => setForm({ ...form, name_description: e.target.value })}
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
              <label className="block text-sm text-slate-600 mb-1">Location</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Equipment Name & Description</th>
              <th className="px-4 py-2 text-left font-medium">Serial Number</th>
              <th className="px-4 py-2 text-left font-medium">Location</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {equipment.map((eq) => (
              <tr key={eq.id}>
                <td className="px-4 py-3 font-medium">
                  <Link to={`/equipment/${eq.id}`} className="text-emerald-700 hover:underline">
                    {eq.name_description}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{eq.serial_number}</td>
                <td className="px-4 py-3 text-slate-600">{eq.location}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(eq.id)} className="text-red-600 hover:text-red-800">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {equipment.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No equipment yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

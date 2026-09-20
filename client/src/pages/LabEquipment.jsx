import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { useConfirm } from '../context/ConfirmContext';
import LabFormTabs from '../components/LabFormTabs';

export default function LabEquipment() {
  const { id } = useParams();
  const confirmDialog = useConfirm();
  const [lab, setLab] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [error, setError] = useState('');

  function loadEquipment() {
    api.get('/equipment', { params: { laboratory_id: id } }).then((res) => setEquipment(res.data));
  }

  useEffect(() => {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
    loadEquipment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
      </div>

      <LabFormTabs laboratoryId={id} active="equipment-monitoring-record" />

      {error && <p className="text-sm text-red-600">{error}</p>}

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
                  No equipment yet. Add one from the{' '}
                  <Link to={`/laboratories/${id}`} className="text-emerald-700 hover:underline">
                    Inventory Sheet
                  </Link>
                  , with category set to Equipment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

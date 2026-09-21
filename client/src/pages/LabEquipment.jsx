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

  async function handleRetire(unitId) {
    if (
      !(await confirmDialog(
        'Retire this unit? Its 201 file and service history are kept, and it stops counting against the inventory quantity.'
      ))
    )
      return;
    setError('');
    try {
      await api.post(`/equipment/${unitId}/retire`);
      loadEquipment();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to retire this unit');
    }
  }

  if (!lab) return <p className="text-slate-500">Loading…</p>;

  const missingSerials = equipment.filter((eq) => eq.status === 'Active' && !eq.serial_number).length;

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

      {missingSerials > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          {missingSerials} unit{missingSerials === 1 ? '' : 's'} still need a serial number. Open a unit to record it.
        </p>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Equipment Name &amp; Description</th>
              <th className="px-4 py-2 text-left font-medium">System Equipment ID</th>
              <th className="px-4 py-2 text-left font-medium">Serial Number</th>
              <th className="px-4 py-2 text-left font-medium">Location</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {equipment.map((eq) => (
              <tr key={eq.id} className={eq.status === 'Retired' ? 'bg-slate-50 text-slate-400' : ''}>
                <td className="px-4 py-3 font-medium">
                  <Link to={`/equipment/${eq.id}`} className="text-emerald-700 hover:underline">
                    {eq.name_description}
                  </Link>
                  <span className="text-slate-400 font-normal"> · unit {eq.unit_no}</span>
                </td>
                <td className="px-4 py-3 text-slate-600 font-mono text-xs">{eq.equipment_code}</td>
                <td className="px-4 py-3 text-slate-600">
                  {eq.serial_number || <span className="text-amber-700">Not set</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{eq.location}</td>
                <td className="px-4 py-3 text-slate-600">{eq.status}</td>
                <td className="px-4 py-3 text-right">
                  {eq.status === 'Active' && (
                    <button onClick={() => handleRetire(eq.id)} className="text-red-600 hover:text-red-800">
                      Retire
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {equipment.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
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

import { useState, useEffect } from 'react';
import api from '../api/client';

export default function EquipmentInstancesManager({ itemId, itemName, quantity, onInstancesCreated }) {
  const [instances, setInstances] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [instanceData, setInstanceData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadInstances();
  }, [itemId]);

  function loadInstances() {
    api.get(`/equipment-instances/item/${itemId}`)
      .then((res) => setInstances(res.data))
      .catch(() => setInstances([]));
  }

  function initializeForm() {
    setInstanceData(
      Array(Math.max(quantity - instances.length, 0))
        .fill()
        .map(() => ({ serial_number: '', location: '' }))
    );
  }

  function handleOpenForm() {
    initializeForm();
    setShowForm(true);
    setError('');
  }

  function handleInstanceChange(index, field, value) {
    const updated = [...instanceData];
    updated[index] = { ...updated[index], [field]: value };
    setInstanceData(updated);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const toCreate = instanceData.filter((inst) => inst.serial_number.trim());
    if (toCreate.length === 0) {
      setError('Please enter at least one serial number');
      setLoading(false);
      return;
    }

    try {
      const res = await api.post('/equipment-instances/bulk', {
        item_id: itemId,
        instances: toCreate,
      });
      setInstances((prev) => [...prev, ...res.data]);
      setShowForm(false);
      setInstanceData([]);
      if (onInstancesCreated) onInstancesCreated(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create instances');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteInstance(id) {
    if (!window.confirm('Delete this equipment unit?')) return;
    try {
      await api.delete(`/equipment-instances/${id}`);
      setInstances((prev) => prev.filter((inst) => inst.id !== id));
    } catch (err) {
      setError('Failed to delete instance');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800">Equipment Units ({instances.length})</h3>
          <p className="text-sm text-slate-500">Track individual units with serial numbers</p>
        </div>
        <button
          onClick={handleOpenForm}
          disabled={instances.length >= quantity}
          className="disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          + Add Units
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {instances.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
          <p className="text-sm text-slate-600">No equipment units recorded yet</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-700">Serial Number</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">Location</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">Status</th>
                <th className="px-4 py-2 text-right w-20 font-medium text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((inst) => (
                <tr key={inst.id} className="border-b border-slate-200 hover:bg-slate-50">
                  <td className="px-4 py-2">{inst.serial_number}</td>
                  <td className="px-4 py-2 text-slate-600">{inst.location || '—'}</td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {inst.status || 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDeleteInstance(inst.id)}
                      className="text-red-600 hover:text-red-800 text-xs underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
          <h4 className="font-medium text-slate-800">Add Equipment Units</h4>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {instanceData.map((inst, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  placeholder={`Unit ${index + 1} Serial Number`}
                  value={inst.serial_number}
                  onChange={(e) => handleInstanceChange(index, 'serial_number', e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  required
                />
                <input
                  type="text"
                  placeholder="Location (optional)"
                  value={inst.location}
                  onChange={(e) => handleInstanceChange(index, 'location', e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 disabled:opacity-50 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2 text-sm"
            >
              {loading ? 'Creating...' : `Create ${instanceData.filter((i) => i.serial_number.trim()).length} Unit(s)`}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

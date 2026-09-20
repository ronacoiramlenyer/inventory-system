import { useState, useEffect } from 'react';
import api from '../api/client';

export default function EquipmentLogsMigrationHelper({ itemId, instances }) {
  const [orphanedLogs, setOrphanedLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedInstanceId, setSelectedInstanceId] = useState(null);
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    loadOrphanedLogs();
  }, [itemId]);

  async function loadOrphanedLogs() {
    try {
      setLoading(true);
      const res = await api.get(`/equipment/${itemId}/logs`);
      const orphaned = res.data.filter(log => !log.equipment_instance_id);
      setOrphanedLogs(orphaned);
    } catch (err) {
      setError('Failed to load logs');
    } finally {
      setLoading(false);
    }
  }

  async function handleMigrateToInstance() {
    if (!selectedInstanceId || orphanedLogs.length === 0) {
      setError('Please select an instance');
      return;
    }

    setMigrating(true);
    setError('');
    try {
      await api.post(`/equipment-instances/${selectedInstanceId}/adopt-logs/${itemId}`);
      setOrphanedLogs([]);
      setSelectedInstanceId(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to migrate logs');
    } finally {
      setMigrating(false);
    }
  }

  if (orphanedLogs.length === 0) {
    return null;
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Checking for logs to migrate...</p>;
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3 no-print">
      <div>
        <h4 className="font-semibold text-amber-900">Migrate Existing Logs</h4>
        <p className="text-sm text-amber-700">
          {orphanedLogs.length === 1
            ? 'One earlier entry was recorded against this item as a whole. Pick the unit it belongs to.'
            : `${orphanedLogs.length} earlier entries were recorded against this item as a whole. Pick the unit they belong to.`}
        </p>
      </div>

      {instances.length === 0 ? (
        <p className="text-sm text-amber-800">
          Create at least one equipment instance first, then these logs will be linked to it.
        </p>
      ) : (
        <>
          <div>
            <label className="block text-sm text-amber-900 mb-2 font-medium">
              Link logs to which unit?
            </label>
            <select
              value={selectedInstanceId || ''}
              onChange={(e) => setSelectedInstanceId(Number(e.target.value))}
              className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— Select an instance —</option>
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  SN: {inst.serial_number} • Location: {inst.location || '(Not set)'}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-amber-900">{error}</p>}

          <button
            onClick={handleMigrateToInstance}
            disabled={!selectedInstanceId || migrating}
            className="w-full disabled:opacity-50 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            {migrating ? 'Migrating...' : `Migrate ${orphanedLogs.length} Log(s)`}
          </button>
        </>
      )}
    </div>
  );
}

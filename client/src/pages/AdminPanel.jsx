import { useState } from 'react';
import api from '../api/client';

export default function AdminPanel() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handlePurgeInventory() {
    if (
      !window.confirm(
        '⚠️ WARNING: This will delete ALL inventory data (items, transactions, logs, schedules, requisitions, etc.).\n\nUsers, departments, and labs will be preserved.\n\nThis cannot be undone without a database backup.\n\nAre you sure?'
      )
    ) {
      return;
    }

    if (!window.confirm('⚠️ FINAL CONFIRMATION: Delete all inventory data?')) {
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await api.post('/admin/purge-inventory');
      setMessage(res.data.message);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to purge inventory');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Admin Panel</h1>
      <p className="text-slate-600 mb-8">Manage system-wide operations and database maintenance.</p>

      <div className="space-y-6">
        {/* Purge Inventory Section */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-red-900 mb-3">Purge Inventory Data</h2>
          <p className="text-sm text-red-800 mb-4">
            Delete all operational data (items, transactions, logs, work requests, schedules, etc.) and reset ID
            sequences. This allows you to start fresh with a clean database for new imports.
          </p>
          <div className="space-y-3">
            <div className="text-sm text-red-700 bg-red-100 p-3 rounded">
              <strong>What gets deleted:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All items and equipment instances</li>
                <li>All transactions and inventory counts</li>
                <li>All logs (equipment, incident, waste disposal)</li>
                <li>All work requests and schedules</li>
                <li>All borrowing requests and requisitions</li>
                <li>All BGU job requests</li>
              </ul>
            </div>
            <div className="text-sm text-red-700 bg-yellow-50 p-3 rounded border border-yellow-200">
              <strong>What is preserved:</strong>
              <ul className="list-disc list-inside mt-2">
                <li>Users and departments</li>
                <li>Laboratories</li>
                <li>Database schema and structure</li>
              </ul>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 mt-4 font-medium">{error}</p>}
          {message && <p className="text-sm text-green-600 mt-4 font-medium">{message}</p>}

          <button
            onClick={handlePurgeInventory}
            disabled={loading}
            className="mt-4 w-full disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-4 py-3"
          >
            {loading ? 'Purging...' : '🗑️ Purge All Inventory Data'}
          </button>
        </div>

        {/* Info Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Workflow</h3>
          <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
            <li>Click "Purge All Inventory Data" to clear the database</li>
            <li>Go to Inventory Sheet (F-LAB-010) and import fresh Excel data</li>
            <li>Navigate to Equipment Monitoring Record (F-LAB-001) for each equipment type</li>
            <li>Click "Manage units" and create instances with serial numbers</li>
            <li>System is ready for use with fresh data</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

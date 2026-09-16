import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const LAB_STATUS_STYLES = {
  approved: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function LaboratoryDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const navigate = useNavigate();

  const [lab, setLab] = useState(null);
  const [error, setError] = useState('');

  function loadLab() {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
  }

  useEffect(() => {
    loadLab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // The F-LAB-010 Inventory Sheet is the single point of entry for viewing and
  // adding items in this lab, so an approved lab goes straight to its one
  // current sheet instead of showing a separate items list here.
  useEffect(() => {
    if (lab?.status !== 'approved') return;
    api
      .get('/inventory-counts/current', { params: { laboratory_id: id } })
      .then((res) => navigate(`/inventory-counts/${res.data.id}`, { replace: true }))
      .catch((err) => setError(err.response?.data?.error || 'Failed to open the inventory sheet'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab?.status]);

  async function handleApproveLab() {
    await api.post(`/laboratories/${id}/approve`);
    loadLab();
  }

  async function handleRejectLab() {
    const reason = prompt('Reason for rejecting this laboratory request (optional):') || '';
    await api.post(`/laboratories/${id}/reject`, { reason });
    loadLab();
  }

  if (!lab) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to Laboratories
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{lab.name}</h1>
          <p className="text-sm text-slate-500">
            {isAdmin && `${lab.department_name} · `}
            {lab.location}
          </p>
        </div>
        <span className={`text-xs font-semibold rounded-full px-2 py-1 ${LAB_STATUS_STYLES[lab.status]}`}>
          {lab.status}
        </span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {lab.status === 'pending' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm space-y-2">
          <p>This laboratory is waiting for admin approval before items can be added.</p>
          {isAdmin && (
            <div className="space-x-3">
              <button onClick={handleApproveLab} className="font-medium text-emerald-700 hover:text-emerald-900">
                Approve
              </button>
              <button onClick={handleRejectLab} className="font-medium text-red-600 hover:text-red-800">
                Reject
              </button>
            </div>
          )}
        </div>
      )}

      {lab.status === 'rejected' && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
          This laboratory's enrollment was rejected.
          {lab.rejection_reason && <> Reason: {lab.rejection_reason}</>}
        </div>
      )}

      {lab.status === 'approved' && !error && <p className="text-slate-500">Opening inventory sheet…</p>}
    </div>
  );
}

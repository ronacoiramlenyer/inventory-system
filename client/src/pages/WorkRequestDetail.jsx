import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import LabFormTabs from '../components/LabFormTabs';

const STATUS_OPTIONS = ['Filed', 'In Progress', 'Completed', 'Rejected'];

export default function WorkRequestDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const [req, setReq] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [justApproved, setJustApproved] = useState(false);

  function load() {
    api.get(`/work-requests/${id}`).then((res) => {
      setReq(res.data);
      setForm({
        approved_by: res.data.approved_by || '',
        status: res.data.status === 'Pending' ? 'Filed' : res.data.status,
        date_completed: res.data.date_completed || '',
        remarks: res.data.remarks || '',
      });
    });
  }

  useEffect(load, [id]);

  const sameDept = req && Number(user.department_id) === Number(req.department_id);
  const canApprove = req && (user.role === 'admin' || (user.role === 'subject_coordinator' && sameDept));
  const canManage = canApprove || (req && user.role === 'secretary' && sameDept);

  async function handleApprove() {
    setError('');
    setApproving(true);
    try {
      await api.post(`/work-requests/${id}/approve`);
      setJustApproved(true);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve request');
    } finally {
      setApproving(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.put(`/work-requests/${id}`, form);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!req || !form) return <p className="text-slate-500">Loading…</p>;

  const backLink =
    user.role === 'secretary'
      ? { to: '/work-requests', label: 'Filed Requests' }
      : { to: `/laboratories/${req.laboratory_id}/work-requests`, label: req.laboratory_name };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link to={backLink.to} className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to {backLink.label}
        </Link>
        <button
          onClick={() => window.print()}
          className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          Print
        </button>
      </div>

      {user.role !== 'secretary' && <LabFormTabs laboratoryId={req.laboratory_id} active="equipment-work-request" />}

      {error && <p className="text-sm text-red-600 no-print">{error}</p>}

      {location.state?.justSubmitted && req.status === 'Pending' && (
        <p className="no-print text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          Submitted — awaiting Subject Coordinator approval before it's filed for the secretary.
        </p>
      )}
      {justApproved && (
        <p className="no-print text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
          Approved and filed — the secretary can now see and work this request.
        </p>
      )}

      <div className="bg-white border border-slate-300 rounded-xl p-6 max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Equipment Work Request (EWR) Form</h2>
          <span className="text-sm text-slate-500">Date: {req.date_requested}</span>
        </div>
        <p className="text-sm text-slate-600 mb-4">Request No.: {req.request_no}</p>

        <table className="w-full text-sm border-collapse mb-4">
          <tbody>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 w-56">
                Equipment Name & Description:
              </td>
              <td className="border border-slate-300 px-3 py-1.5">{req.equipment_name_description}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">
                Equipment ID/Serial Number:
              </td>
              <td className="border border-slate-300 px-3 py-1.5">{req.serial_number}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Department:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.department_name}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Location:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.laboratory_name}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Date Needed:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.date_needed}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Nature of Request:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.nature_of_request}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">
                Detailed Description of Request:
              </td>
              <td className="border border-slate-300 px-3 py-1.5 whitespace-pre-wrap">{req.detailed_description}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Requested by:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.requested_by}</td>
            </tr>
          </tbody>
        </table>

        {req.status === 'Pending' ? (
          <div className="no-print">
            {canApprove ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-2">
                <p className="text-sm text-amber-800">
                  Awaiting your approval as Subject Coordinator. Approving files this request for the secretary.
                </p>
                <button
                  onClick={handleApprove}
                  disabled={approving}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
                >
                  {approving ? 'Approving…' : 'Approve & File'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                Awaiting approval from the Subject Coordinator before this is filed for the secretary.
              </p>
            )}
          </div>
        ) : canManage ? (
          <form onSubmit={handleSave} className="space-y-3 no-print">
            <h3 className="font-semibold text-slate-700">Status</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Status</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Approved by (Subject Coordinator)</label>
                {canApprove ? (
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    value={form.approved_by}
                    onChange={(e) => setForm({ ...form, approved_by: e.target.value })}
                  />
                ) : (
                  <p className="text-sm text-slate-600 px-1 py-2">{form.approved_by || '—'}</p>
                )}
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Date Completed</label>
                <input
                  type="date"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={form.date_completed}
                  onChange={(e) => setForm({ ...form, date_completed: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Remarks</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                />
              </div>
            </div>
            <button
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>
        ) : (
          <div className="no-print text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 space-y-1">
            <p>Status: {req.status}</p>
            {req.approved_by && <p>Approved by: {req.approved_by}</p>}
            {req.date_completed && <p>Date Completed: {req.date_completed}</p>}
            {req.remarks && <p>Remarks: {req.remarks}</p>}
          </div>
        )}

        <div className="hidden print:block mt-4 text-sm">
          <p>Status: {req.status}</p>
          {req.approved_by && <p>Approved by: {req.approved_by}</p>}
          {req.date_completed && <p>Date Completed: {req.date_completed}</p>}
          {req.remarks && <p>Remarks: {req.remarks}</p>}
        </div>
      </div>
    </div>
  );
}

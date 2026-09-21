import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import api from '../api/client';
import { refreshNotifications } from '../api/notifications';
import { useAuth } from '../context/AuthContext';
import LabFormTabs from '../components/LabFormTabs';
import { PrintHeader, PrintFooter, PrintOrientation } from '../components/PrintHeaderFooter';

const STATUS_OPTIONS = ['Filed', 'In Progress', 'Completed', 'Rejected'];
const NATURE_TYPES = ['Preventive', 'Repair', 'Calibration'];

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
  const [completing, setCompleting] = useState(false);
  const [completeForm, setCompleteForm] = useState({ date_completed: '', remarks: '' });

  function load() {
    api.get(`/work-requests/${id}`).then((res) => {
      setReq(res.data);
      setForm({
        approved_by: res.data.approved_by || '',
        status: res.data.status === 'Pending' ? 'Filed' : res.data.status,
        date_completed: res.data.date_completed || '',
        remarks: res.data.remarks || '',
      });
      setCompleteForm({
        date_completed: res.data.date_completed || new Date().toISOString().slice(0, 10),
        remarks: res.data.remarks || '',
      });
    });
  }

  useEffect(load, [id]);

  const inScope =
    req &&
    (user.role === 'secretary'
      ? (user.department_ids || []).map(Number).includes(Number(req.department_id))
      : Number(user.department_id) === Number(req.department_id));
  const canApprove = req && (user.role === 'admin' || (user.role === 'subject_coordinator' && inScope));
  const canManage = canApprove || (req && user.role === 'secretary' && inScope);
  // Completed is staff's call once the Secretary has it In Progress (a
  // Coordinator/admin can still do it directly, same override they have
  // over every other status) -- matches userCanCompleteWork server-side.
  const canCompleteWork = canApprove || (req && user.role === 'staff' && inScope);
  const statusOptionsForRole = user.role === 'secretary' ? STATUS_OPTIONS.filter((s) => s !== 'Completed') : STATUS_OPTIONS;

  async function handleApprove() {
    setError('');
    setApproving(true);
    try {
      await api.post(`/work-requests/${id}/approve`);
      setJustApproved(true);
      load();
      refreshNotifications();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve request');
    } finally {
      setApproving(false);
    }
  }

  async function handleComplete(e) {
    e.preventDefault();
    setError('');
    setCompleting(true);
    try {
      await api.put(`/work-requests/${id}`, { status: 'Completed', ...completeForm });
      load();
      refreshNotifications();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to mark this request completed');
    } finally {
      setCompleting(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.put(`/work-requests/${id}`, form);
      load();
      refreshNotifications();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!req || !form) return <p className="text-slate-500">Loading…</p>;

  const backLink =
    user.role === 'secretary'
      ? { to: '/work-requests', label: 'Equipment Work Requests' }
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

      <div className="bg-white border border-slate-300 rounded-xl p-6 max-w-2xl print:border-none print:rounded-none">
        <PrintOrientation />
        <PrintHeader />
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-800">Equipment Work Request (EWR)</h2>
          <p className="text-sm text-slate-600">Date: {req.date_requested}</p>
        </div>
        <p className="text-sm text-slate-600 mb-4">Request No.: {req.request_no}</p>

        <table className="w-full text-sm border-collapse mb-4">
          <tbody>
            <tr>
              <td rowSpan={4} className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 align-top w-32">
                Equipment Information
              </td>
              <td className="border border-slate-300 px-3 py-1.5 font-medium w-56">Equipment Name &amp; Description:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.equipment_name_description}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-medium">Equipment ID/Serial Number:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.serial_number}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-medium">Department:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.department_name}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-medium">Location:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.laboratory_name}</td>
            </tr>

            <tr>
              <td rowSpan={2} className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 align-top">
                Request Details
              </td>
              <td className="border border-slate-300 px-3 py-1.5 font-medium">Date Needed:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.date_needed}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-medium align-top">Nature of Request:</td>
              <td className="border border-slate-300 px-3 py-2">
                {NATURE_TYPES.map((type) => (
                  <div key={type}>
                    {req.nature_of_request === type ? '☑' : '☐'} {type}
                  </div>
                ))}
              </td>
            </tr>

            <tr>
              <td colSpan={3} className="border border-slate-300 px-3 py-2 align-top">
                <p className="font-semibold mb-2">Detailed Description of Request:</p>
                <p className="whitespace-pre-wrap min-h-16">{req.detailed_description}</p>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-6 text-sm text-slate-700 mb-4">
          <div>
            <p>Requested by:</p>
            <p className="mt-6 mb-1 border-b border-slate-400 pb-0.5">{req.requested_by}</p>
            <p className="text-xs text-slate-500">Name of Laboratory Custodian</p>
          </div>
          <div>
            <p>Approved by:</p>
            <p className="mt-6 mb-1 border-b border-slate-400 pb-0.5">{req.approved_by}</p>
            <p className="text-xs text-slate-500">Subject Coordinator</p>
          </div>
        </div>

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
                  {statusOptionsForRole.map((opt) => (
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
        ) : req.status === 'In Progress' && canCompleteWork ? (
          <form onSubmit={handleComplete} className="no-print bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-3">
            <p className="text-sm text-amber-800">
              The Secretary has this in progress. Mark it Completed once the work is actually done.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Date Completed</label>
                <input
                  type="date"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={completeForm.date_completed}
                  onChange={(e) => setCompleteForm({ ...completeForm, date_completed: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Remarks</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={completeForm.remarks}
                  onChange={(e) => setCompleteForm({ ...completeForm, remarks: e.target.value })}
                />
              </div>
            </div>
            <button
              disabled={completing}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
            >
              {completing ? 'Saving…' : 'Mark Completed'}
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

        <PrintFooter code="F-LAB-004" date="04-01-25" />
      </div>
    </div>
  );
}

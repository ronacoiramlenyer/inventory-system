import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import LabFormTabs from '../components/LabFormTabs';
import { PrintHeader, PrintFooter } from '../components/PrintHeaderFooter';

const MANAGE_STATUS_OPTIONS = ['Approved', 'Returned'];

// approved_at is a JS-generated ISO-8601 UTC string already; older/other
// timestamps in this app come straight from SQLite's datetime('now') as
// "YYYY-MM-DD HH:MM:SS" instead, which some browsers won't parse as-is --
// handle both.
function formatSignedAt(value) {
  if (!value) return value;
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// created_at is a SQLite UTC timestamp ("YYYY-MM-DD HH:MM:SS") -- just the
// date part is needed for the form's "Date:" field.
function formatDateOnly(value) {
  if (!value) return '—';
  return value.slice(0, 10);
}

export default function BorrowingRequestDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [req, setReq] = useState(null);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [signedCopyUrl, setSignedCopyUrl] = useState(null);
  const [signedCopyType, setSignedCopyType] = useState(null);
  const [uploadingCopy, setUploadingCopy] = useState(false);
  const [copyError, setCopyError] = useState('');

  function load() {
    api.get(`/borrowing-requests/${id}`).then((res) => {
      setReq(res.data);
      setItems(res.data.items);
      setStatus(res.data.status === 'Pending' ? 'Approved' : res.data.status);
    });
  }

  useEffect(load, [id]);

  // The signed copy is served through an authenticated API route, not a
  // plain static URL, so a bare <img src> can't reach it -- fetch it as a
  // blob and point the image/link at an object URL instead.
  useEffect(() => {
    if (!req?.signed_copy_key) {
      setSignedCopyUrl(null);
      return;
    }
    let url;
    api.get(`/borrowing-requests/${id}/signed-copy`, { responseType: 'blob' }).then((res) => {
      url = URL.createObjectURL(res.data);
      setSignedCopyType(res.data.type);
      setSignedCopyUrl(url);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [req?.signed_copy_key, id]);

  async function handleUploadSignedCopy(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setCopyError('');
    setUploadingCopy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/borrowing-requests/${id}/signed-copy`, form);
      load();
    } catch (err) {
      setCopyError(err.response?.data?.error || 'Failed to upload signed copy');
    } finally {
      setUploadingCopy(false);
    }
  }

  async function handleRemoveSignedCopy() {
    if (!confirm('Remove the attached signed copy?')) return;
    await api.delete(`/borrowing-requests/${id}/signed-copy`);
    load();
  }

  const inScope = req && Number(user.department_id) === Number(req.department_id);
  const canApprove = req && (user.role === 'admin' || (user.role === 'subject_coordinator' && inScope));

  function updateItem(itemId, value) {
    setItems((rows) => rows.map((r) => (r.id === itemId ? { ...r, returned_condition: value } : r)));
  }

  async function handleApprove() {
    setError('');
    setApproving(true);
    try {
      await api.post(`/borrowing-requests/${id}/approve`);
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
      await api.put(`/borrowing-requests/${id}`, {
        status,
        items: items.map((it) => ({ id: it.id, returned_condition: it.returned_condition })),
      });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!req) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link
          to={`/laboratories/${req.laboratory_id}/borrowing-requests`}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Back to {req.laboratory_name}
        </Link>
        <button
          onClick={() => window.print()}
          className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          Print
        </button>
      </div>

      <LabFormTabs laboratoryId={req.laboratory_id} active="borrowing-request" />

      {error && <p className="text-sm text-red-600 no-print">{error}</p>}

      <div className="bg-white border border-slate-300 rounded-xl p-6 max-w-2xl print:border-none print:rounded-none">
        <PrintHeader />
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-800">Borrowing Request Form (BRF)</h2>
          <p className="text-sm text-slate-600">Date: {formatDateOnly(req.created_at)}</p>
        </div>
        <p className="text-sm text-slate-600 mb-4">Request No.: {req.reference_no || '—'}</p>

        <table className="w-full text-sm border-collapse mb-4">
          <tbody>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 w-56">
                Borrower's Name and Signature:
              </td>
              <td className="border border-slate-300 px-3 py-1.5">{req.borrower_name}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Department/Unit:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.department_unit}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Date Needed:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.date_needed}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Purpose:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.purpose}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Return Date:</td>
              <td className="border border-slate-300 px-3 py-1.5">{req.return_date}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Item</th>
              <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Description</th>
              <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Equipment ID (if applicable)</th>
              <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Returned Condition</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id}>
                <td className="border border-slate-300 px-3 py-2">{i + 1}</td>
                <td className="border border-slate-300 px-3 py-2">{item.description}</td>
                <td className="border border-slate-300 px-3 py-2">{item.equipment_id_text}</td>
                <td className="border border-slate-300 px-3 py-2 no-print">
                  <input
                    className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                    value={item.returned_condition || ''}
                    onChange={(e) => updateItem(item.id, e.target.value)}
                  />
                </td>
                <td className="hidden print:table-cell border border-slate-300 px-3 py-2">
                  {item.returned_condition}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="border border-slate-300 px-3 py-4 text-center text-slate-400">
                  No items listed.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1 mb-4">
          <p className="font-semibold">Terms & Conditions</p>
          <p>By signing, the borrower acknowledges and agrees to the following:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Full responsibility for the issued equipment or use of the laboratory.</li>
            <li>Agreement to pay for any damage or loss incurred.</li>
            <li>Confirmation that all items are in functional condition unless otherwise noted.</li>
            <li>Waiver of liability claims related to the use of this equipment.</li>
          </ul>
        </div>

        <div className="text-sm text-slate-700 space-y-8 mb-4">
          <p>
            Signature: <span className="inline-block w-56 border-b border-slate-400">&nbsp;</span>
            &nbsp;&nbsp;&nbsp; Date: <span className="inline-block w-36 border-b border-slate-400">&nbsp;</span>
          </p>
          <div>
            <p>Issued by:</p>
            <p className="mt-8 mb-1 w-56 border-b border-slate-400 pb-0.5">&nbsp;</p>
            <p className="text-xs text-slate-500">Name &amp; Signature</p>
          </div>
        </div>

        {req.status === 'Pending' ? (
          <div className="no-print">
            {canApprove ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-2">
                <p className="text-sm text-amber-800">Awaiting your approval as Subject Coordinator.</p>
                <button
                  onClick={handleApprove}
                  disabled={approving}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
                >
                  {approving ? 'Approving…' : 'Approve'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                Awaiting approval from the Subject Coordinator.
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-3 no-print">
            <h3 className="font-semibold text-slate-700">Status</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Status</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {MANAGE_STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Approved by (Subject Coordinator)</label>
                <p className="text-sm text-slate-600 px-1 py-2">{req.approved_by || '—'}</p>
              </div>
            </div>
            <button
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>
        )}

        {req.approved_by && (
          <div className="mt-3 text-sm text-slate-700">
            <p>Approved by: {req.approved_by}</p>
            <p className="text-xs text-slate-400 italic mt-1">
              Digitally signed by {req.approved_by}
              {req.approved_by_username && ` (@${req.approved_by_username})`} on {formatSignedAt(req.approved_at)} —
              Lab Management System
            </p>
          </div>
        )}

        <div className="hidden print:block mt-4 text-sm">
          <p>Status: {req.status}</p>
        </div>

        <div className="no-print mt-4 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-slate-700 text-sm">Signed Hardcopy</h3>
          <p className="text-xs text-slate-500">
            This form is meant to be signed by hand by the borrower. Attach a photo or scan of the signed printout
            here as the official record.
          </p>
          {copyError && <p className="text-sm text-red-600">{copyError}</p>}
          {req.signed_copy_key ? (
            <div className="space-y-2">
              {signedCopyUrl && signedCopyType?.startsWith('image/') ? (
                <a href={signedCopyUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={signedCopyUrl}
                    alt="Signed borrowing request"
                    className="max-h-64 rounded-lg border border-slate-200"
                  />
                </a>
              ) : signedCopyUrl ? (
                <a
                  href={signedCopyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 text-sm underline"
                >
                  View signed copy (PDF)
                </a>
              ) : (
                <p className="text-sm text-slate-400">Loading…</p>
              )}
              <p className="text-xs text-slate-500">
                Uploaded by {req.signed_copy_uploaded_by_name || '—'} on {formatSignedAt(req.signed_copy_uploaded_at)}
              </p>
              <div className="flex gap-2">
                <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg px-3 py-1.5">
                  {uploadingCopy ? 'Uploading…' : 'Replace'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={handleUploadSignedCopy}
                    disabled={uploadingCopy}
                  />
                </label>
                <button onClick={handleRemoveSignedCopy} className="text-slate-400 hover:text-red-600 text-xs underline">
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label className="inline-block cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2">
              {uploadingCopy ? 'Uploading…' : '+ Attach Signed Copy'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={handleUploadSignedCopy}
                disabled={uploadingCopy}
              />
            </label>
          )}
        </div>

        <PrintFooter code="F-LAB-007" date="04-01-25" />
      </div>
    </div>
  );
}

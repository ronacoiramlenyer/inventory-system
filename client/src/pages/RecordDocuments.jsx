import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';

const emptyForm = { title: '', period_label: '', document_date: '', notes: '' };

// R-LAB-101 Annual Approved CAPEX / R-LAB-102 Annual Approved OPEX.
//
// Unlike every other record, these have no form behind them -- the approved
// budget document itself is the record, so each entry is a filing slot with
// the signed document attached to it. Admin files and removes them; everyone
// else reads.
export default function RecordDocuments() {
  const { code } = useParams();
  const { user } = useAuth();
  const confirmDialog = useConfirm();
  const canEdit = user.role === 'admin';
  const [record, setRecord] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [uploadingId, setUploadingId] = useState(null);
  const fileInputRef = useRef(null);
  const pendingUploadId = useRef(null);

  function load() {
    api
      .get(`/records/${code}/documents`)
      .then((res) => setRecord(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load these records'));
  }

  useEffect(load, [code]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/records/${code}/documents/${editingId}`, form);
      } else {
        await api.post(`/records/${code}/documents`, form);
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    }
  }

  function startEdit(doc) {
    setEditingId(doc.id);
    setForm({
      title: doc.title,
      period_label: doc.period_label || '',
      document_date: doc.document_date || '',
      notes: doc.notes || '',
    });
    setShowForm(true);
  }

  async function handleDelete(doc) {
    if (!(await confirmDialog(`Remove "${doc.title}" and its attached document? This cannot be undone.`))) return;
    await api.delete(`/records/${code}/documents/${doc.id}`);
    load();
  }

  function pickFile(docId) {
    pendingUploadId.current = docId;
    fileInputRef.current?.click();
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    const docId = pendingUploadId.current;
    e.target.value = '';
    if (!file || !docId) return;
    setError('');
    setUploadingId(docId);
    try {
      const data = new FormData();
      data.append('file', file);
      await api.post(`/records/documents/${docId}/file`, data);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to attach that file');
    } finally {
      setUploadingId(null);
    }
  }

  // The file is behind the API's auth, so it can't just be an <a href> --
  // fetch it as a blob and hand the browser an object URL for that.
  async function openFile(doc) {
    try {
      const res = await api.get(`/records/documents/${doc.id}/file`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError('Could not open that document');
    }
  }

  async function detachFile(doc) {
    if (!(await confirmDialog(`Remove the attached document from "${doc.title}"?`))) return;
    await api.delete(`/records/documents/${doc.id}/file`);
    load();
  }

  if (error && !record) return <p className="text-sm text-red-600">{error}</p>;
  if (!record) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/records" className="text-sm text-slate-500 hover:text-slate-800">
            ← Back to Records
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 mt-1">
            <span className="font-mono text-slate-500 mr-2">{record.code}</span>
            {record.name}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{record.retains}</p>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm);
              setShowForm((s) => !s);
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2 shrink-0"
          >
            + File a Document
          </button>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFile} className="hidden" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {showForm && canEdit && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3"
        >
          <div className="md:col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Title</label>
            <input
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={`${record.name} — approved`}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Budget year</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.period_label}
              onChange={(e) => setForm({ ...form, period_label: e.target.value })}
              placeholder="SY 2026-2027"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Date approved</label>
            <input
              type="date"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.document_date}
              onChange={(e) => setForm({ ...form, document_date: e.target.value })}
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-sm text-slate-600 mb-1">Notes</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="md:col-span-4 flex gap-2">
            <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2">
              {editingId ? 'Save changes' : 'Create filing'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
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
              <th className="px-4 py-2 text-left font-medium">Title</th>
              <th className="px-4 py-2 text-left font-medium w-36">Budget year</th>
              <th className="px-4 py-2 text-left font-medium w-32">Date approved</th>
              <th className="px-4 py-2 text-left font-medium w-56">Document</th>
              {canEdit && <th className="px-4 py-2 text-right font-medium w-32"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {record.items.map((doc) => (
              <tr key={doc.id} className="align-top">
                <td className="px-4 py-3 font-medium text-slate-700">
                  {doc.title}
                  {doc.notes && <div className="text-xs font-normal text-slate-500 mt-0.5">{doc.notes}</div>}
                </td>
                <td className="px-4 py-3 text-slate-600">{doc.period_label || '—'}</td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{doc.document_date || '—'}</td>
                <td className="px-4 py-3 text-slate-600">
                  {doc.file_key ? (
                    <div className="space-y-0.5">
                      <button onClick={() => openFile(doc)} className="text-emerald-700 hover:underline">
                        Open document
                      </button>
                      <div className="text-xs text-slate-400">
                        filed {doc.file_uploaded_at?.slice(0, 10)} by {doc.file_uploaded_by_name}
                      </div>
                    </div>
                  ) : canEdit ? (
                    <button
                      onClick={() => pickFile(doc.id)}
                      disabled={uploadingId === doc.id}
                      className="text-slate-500 hover:text-slate-800 underline disabled:opacity-50"
                    >
                      {uploadingId === doc.id ? 'Attaching…' : '+ Attach document'}
                    </button>
                  ) : (
                    <span className="text-amber-700">Not yet attached</span>
                  )}
                </td>
                {canEdit && (
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    {doc.file_key && (
                      <button onClick={() => detachFile(doc)} className="text-xs text-slate-400 hover:text-slate-700 underline">
                        detach
                      </button>
                    )}
                    <button onClick={() => startEdit(doc)} className="text-xs text-slate-500 hover:text-slate-800 underline">
                      edit
                    </button>
                    <button onClick={() => handleDelete(doc)} className="text-xs text-slate-400 hover:text-red-600 underline">
                      remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {record.items.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 5 : 4} className="px-4 py-8 text-center text-slate-400">
                  Nothing filed under {record.code} yet.
                  {canEdit ? ' Use "File a Document" to add the approved budget.' : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        PDF, JPG, PNG or WEBP, up to 1.5MB. No object storage is attached to this account, so the document is
        held in the database itself — keep it to the approved copy rather than a high-resolution scan.
      </p>
    </div>
  );
}

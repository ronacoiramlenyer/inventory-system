import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useConfirm } from '../context/ConfirmContext';
import LabFormTabs from '../components/LabFormTabs';
import { PrintHeader, PrintFooter, PrintOrientation } from '../components/PrintHeaderFooter';

const INCIDENT_TYPES = ['Injury', 'Chemical Spill', 'Fire', 'Equipment Damage', 'Biological Hazard', 'Electrical Issue'];

function formatIncidentDatetime(value) {
  if (!value) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// created_at is a SQLite UTC timestamp ("YYYY-MM-DD HH:MM:SS"), which some
// browsers won't parse as-is -- make it ISO-8601 first.
function formatSignedAt(value) {
  if (!value) return value;
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function IncidentReportDetail() {
  const { id } = useParams();
  const confirmDialog = useConfirm();
  const [report, setReport] = useState(null);
  const [signedCopyUrl, setSignedCopyUrl] = useState(null);
  const [signedCopyType, setSignedCopyType] = useState(null);
  const [uploadingCopy, setUploadingCopy] = useState(false);
  const [copyError, setCopyError] = useState('');

  function load() {
    api.get(`/incident-reports/${id}`).then((res) => setReport(res.data));
  }

  useEffect(load, [id]);

  // The signed copy is served through an authenticated API route, not a
  // plain static URL, so a bare <img src> can't reach it -- fetch it as a
  // blob and point the image/link at an object URL instead.
  useEffect(() => {
    if (!report?.signed_copy_key) {
      setSignedCopyUrl(null);
      return;
    }
    let url;
    api.get(`/incident-reports/${id}/signed-copy`, { responseType: 'blob' }).then((res) => {
      url = URL.createObjectURL(res.data);
      setSignedCopyType(res.data.type);
      setSignedCopyUrl(url);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [report?.signed_copy_key, id]);

  async function handleUploadSignedCopy(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setCopyError('');
    setUploadingCopy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/incident-reports/${id}/signed-copy`, form);
      load();
    } catch (err) {
      setCopyError(err.response?.data?.error || 'Failed to upload signed copy');
    } finally {
      setUploadingCopy(false);
    }
  }

  async function handleRemoveSignedCopy() {
    if (!(await confirmDialog('Remove the attached signed copy?'))) return;
    await api.delete(`/incident-reports/${id}/signed-copy`);
    load();
  }

  if (!report) return <p className="text-slate-500">Loading…</p>;

  const selectedTypes = report.incident_types ? report.incident_types.split(', ') : [];
  const isSignedImage = !!report?.signed_copy_key && signedCopyType?.startsWith('image/');
  const isSignedPdf = !!report?.signed_copy_key && signedCopyType === 'application/pdf';

  // Once a signed hardcopy is attached, that scan is the real record --
  // Print should reproduce it, not the blank digital template underneath
  // (its signature lines were never actually signed on screen). A PDF
  // can't be dropped into the page for window.print() the way an image
  // can, so it opens in a new tab instead, where the browser's own PDF
  // viewer has a print control.
  function handlePrint() {
    if (isSignedPdf && signedCopyUrl) {
      window.open(signedCopyUrl, '_blank');
      return;
    }
    window.print();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link
          to={`/laboratories/${report.laboratory_id}/incident-reports`}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Back to {report.laboratory_name}
        </Link>
        <button
          onClick={handlePrint}
          className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          Print
        </button>
      </div>

      <LabFormTabs laboratoryId={report.laboratory_id} active="incident-report" />

      <div className="bg-white border border-slate-300 rounded-xl p-6 max-w-2xl print:border-none print:rounded-none">
        {isSignedImage && signedCopyUrl && (
          <img src={signedCopyUrl} alt="Signed incident report" className="hidden print:block w-full h-auto" />
        )}
        <PrintOrientation />
        <div className={isSignedImage ? 'print:hidden' : ''}>
          <PrintHeader />
        <h2 className="text-lg font-bold text-slate-800 mb-1">Laboratory Incident Report (LIR)</h2>
        <p className="text-sm text-slate-600 mb-4">Reference No.: {report.reference_no || '—'}</p>

        <table className="w-full text-sm border-collapse">
          <tbody>
            <tr>
              <td rowSpan={4} className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 align-top w-32">
                General Information
              </td>
              <td className="border border-slate-300 px-3 py-1.5 font-medium w-48">Date &amp; Time of Incident:</td>
              <td className="border border-slate-300 px-3 py-1.5">{formatIncidentDatetime(report.incident_datetime)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-medium">Class:</td>
              <td className="border border-slate-300 px-3 py-1.5">{report.class_name}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-medium">Teacher:</td>
              <td className="border border-slate-300 px-3 py-1.5">{report.teacher}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-medium">Laboratory:</td>
              <td className="border border-slate-300 px-3 py-1.5">{report.laboratory_name}</td>
            </tr>

            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 align-top">
                Type of Incident
              </td>
              <td colSpan={2} className="border border-slate-300 px-3 py-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {INCIDENT_TYPES.map((type) => (
                    <span key={type}>
                      {selectedTypes.includes(type) ? '☑' : '☐'} {type}
                    </span>
                  ))}
                  <span>
                    {report.incident_type_other ? '☑' : '☐'} Others: {report.incident_type_other}
                  </span>
                </div>
              </td>
            </tr>

            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 align-top">
                Individuals Involved:
                <br />
                (Name / Grade-Section)
              </td>
              <td colSpan={2} className="border border-slate-300 px-3 py-2 whitespace-pre-wrap align-top min-h-16">
                {report.individuals_involved}
              </td>
            </tr>

            <tr>
              <td colSpan={3} className="border border-slate-300 px-3 py-2 align-top">
                <p className="font-semibold mb-2">Detailed Description of the Incident:</p>
                <p className="whitespace-pre-wrap min-h-16">{report.detailed_description}</p>
              </td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-sm border-collapse mt-4">
          <tbody>
            <tr>
              <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50 align-top w-32">
                Immediate Actions Taken
              </td>
              <td className="border border-slate-300 px-3 py-2 whitespace-pre-wrap align-top min-h-16">
                {report.immediate_actions_taken}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 text-sm text-slate-700">
          <p>Prepared by:</p>
          <p className="mt-6 mb-1 w-56 border-b border-slate-400 pb-0.5">{report.prepared_by}</p>
          <p className="text-slate-500">{report.designation}</p>
          {report.created_by_name && (
            <p className="mt-2 text-xs text-slate-400 italic">
              Digitally signed by {report.created_by_name}
              {report.created_by_username && ` (@${report.created_by_username})`} on{' '}
              {formatSignedAt(report.created_at)} — Lab Management System
            </p>
          )}
        </div>

        <div className="no-print mt-4 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-slate-700 text-sm">Signed Hardcopy</h3>
          <p className="text-xs text-slate-500">
            This report is meant to be signed by hand by those involved. Attach a photo or scan of the signed
            printout here as the official record. Once attached, the Print button above prints this signed copy
            instead of the blank template.
          </p>
          {copyError && <p className="text-sm text-red-600">{copyError}</p>}
          {report.signed_copy_key ? (
            <div className="space-y-2">
              {signedCopyUrl && signedCopyType?.startsWith('image/') ? (
                <a href={signedCopyUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={signedCopyUrl}
                    alt="Signed incident report"
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
                Uploaded by {report.signed_copy_uploaded_by_name || '—'} on{' '}
                {formatSignedAt(report.signed_copy_uploaded_at)}
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

        <PrintFooter code="F-LAB-009" date="04-01-25" />
        </div>
      </div>
    </div>
  );
}

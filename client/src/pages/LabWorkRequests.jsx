import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import LabFormTabs from '../components/LabFormTabs';
import { PrintHeaderRow, PrintTitleRow, PrintFooter, PrintOrientation } from '../components/PrintHeaderFooter';
import { padRows, paginatePrintRows } from '../utils/padRows';

// A printed page realistically fits ~10 rows of this table once the
// browser's own print margins/header/footer are accounted for.
const MIN_ROWS = 10;

const STATUS_STYLES = {
  Pending: 'bg-amber-100 text-amber-700',
  Filed: 'bg-indigo-100 text-indigo-700',
  Approved: 'bg-sky-100 text-sky-700',
  'In Progress': 'bg-sky-100 text-sky-700',
  Completed: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-red-100 text-red-700',
};

export default function LabWorkRequests() {
  const { id } = useParams();
  const { user } = useAuth();
  const confirmDialog = useConfirm();
  const [lab, setLab] = useState(null);
  const [requests, setRequests] = useState([]);
  const [pendingSchedule, setPendingSchedule] = useState([]);

  function loadRequests() {
    api.get('/work-requests', { params: { laboratory_id: id } }).then((res) => setRequests(res.data));
  }

  function loadPendingSchedule() {
    api.get('/work-requests/pending-schedule', { params: { laboratory_id: id } }).then((res) => setPendingSchedule(res.data));
  }

  useEffect(() => {
    api.get(`/laboratories/${id}`).then((res) => setLab(res.data));
    loadRequests();
    loadPendingSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Temporary: lets an admin clean up a bad/duplicate entry directly from
  // the log, since there's no other way to remove one yet.
  async function handleDelete(requestId) {
    if (!(await confirmDialog('Delete this entry? This cannot be undone.'))) return;
    await api.delete(`/work-requests/${requestId}`);
    loadRequests();
  }

  if (!lab) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link to="/laboratories" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to Laboratories
        </Link>
        <div className="space-x-2">
          {(user.role === 'staff' || user.role === 'admin') && (
            <Link
              to={`/laboratories/${id}/work-requests/new`}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2"
            >
              + New Request
            </Link>
          )}
          <button
            onClick={() => window.print()}
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Print
          </button>
        </div>
      </div>

      <LabFormTabs laboratoryId={id} active="equipment-monitoring-sheet" />

      <div className="flex gap-4">
        {/* Main content area */}
        <div className="flex-1">

      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden print:border-none print:rounded-none">
        <div className="p-6 print:hidden">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Equipment Monitoring Sheet (EMS)</h2>
          <p className="text-sm text-slate-500 mb-3 print:hidden">
            <span className="font-semibold">Laboratory:</span> {lab.name}
          </p>

          {/* table-fixed + colgroup, same fix as ScheduleSheet -- without
              it, this 9-column table's true width ran past the printable
              page, clipping the page-label and Remarks off every page and
              (from the resulting over-wrapped header row) stopping the
              header/footer from repeating on pages after 1. */}
          <table className="w-full text-sm print:text-xs border-collapse table-fixed">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[12%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[16%]" />
              <col className="w-[6%] no-print" />
            </colgroup>
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">
                  Request No.
                  <br />
                  (EWR-YYYY-###)
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Equipment Name</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Equipment ID</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Nature of Request</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Date Requested</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Date Needed</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Status</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Date Completed</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Remarks</th>
                {user.role === 'admin' && (
                  <th className="border border-slate-300 px-3 py-2 no-print w-16">&nbsp;</th>
                )}
              </tr>
            </thead>
            <tbody>
              {padRows(requests, MIN_ROWS).map((r) => (
                <tr key={r.id}>
                  <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">
                    {r.__blank ? null : (
                      <Link to={`/work-requests/${r.id}`} className="text-emerald-700 hover:underline">
                        {r.request_no}
                      </Link>
                    )}
                  </td>
                  <td className="border border-slate-300 px-3 py-2">{r.equipment_name_description}</td>
                  <td className="border border-slate-300 px-3 py-2">{r.serial_number}</td>
                  <td className="border border-slate-300 px-3 py-2">{r.nature_of_request}</td>
                  <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{r.date_requested}</td>
                  <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{r.date_needed}</td>
                  <td className="border border-slate-300 px-3 py-2">
                    {!r.__blank && (
                      <span className={`text-xs font-semibold rounded-full px-2 py-1 ${STATUS_STYLES[r.status] || ''}`}>
                        {r.status}
                      </span>
                    )}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{r.date_completed}</td>
                  <td className="border border-slate-300 px-3 py-2">{r.remarks}</td>
                  {user.role === 'admin' && (
                    <td className="border border-slate-300 px-3 py-2 no-print text-center">
                      {!r.__blank && (
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="text-slate-400 hover:text-red-600 text-xs underline"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

        </div>

        {/* Each printed page is its own table so it can carry its own page
            number -- see paginatePrintRows for why the browser cannot give
            us one from a single long table. */}
        <div className="hidden print:block p-6">
          <PrintOrientation landscape />
          {paginatePrintRows(requests, MIN_ROWS).map((pageRows, pageIndex, allPages) => (
            <table
              key={pageIndex}
              className="print-page w-full text-xs border-collapse table-fixed"
              style={pageIndex < allPages.length - 1 ? { breakAfter: 'page' } : undefined}
            >
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[13%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <PrintHeaderRow pageLabel={`Page ${pageIndex + 1} of ${allPages.length}`} colSpan={9} />
                <PrintTitleRow
                  title="Equipment Monitoring Sheet (EMS)"
                  subtitle={
                    <>
                      <span className="font-semibold">Laboratory:</span> {lab.name}
                    </>
                  }
                  colSpan={9}
                />
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Request No.</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Equipment Name</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Equipment ID</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Nature of Request</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Date Requested</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Date Needed</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Status</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Date Completed</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id}>
                    <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{r.request_no}</td>
                    <td className="border border-slate-300 px-3 py-2">{r.equipment_name_description}</td>
                    <td className="border border-slate-300 px-3 py-2">{r.serial_number}</td>
                    <td className="border border-slate-300 px-3 py-2">{r.nature_of_request}</td>
                    <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{r.date_requested}</td>
                    <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{r.date_needed}</td>
                    <td className="border border-slate-300 px-3 py-2">{r.status}</td>
                    <td className="border border-slate-300 px-3 py-2 whitespace-nowrap">{r.date_completed}</td>
                    <td className="border border-slate-300 px-3 py-2">{r.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          <PrintFooter code="F-LAB-005" date="04-01-25" />
        </div>
      </div>
        </div>
        {/* Sidebar: Pending schedule items */}
        {(user.role === 'staff' || user.role === 'admin') && pendingSchedule.length > 0 && (
          <div className="w-80 shrink-0 no-print">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 sticky top-4">
              <h3 className="text-sm font-semibold text-amber-800 mb-3">
                Due from Schedule
                <br />
                <span className="text-xs font-normal text-amber-700">(PMS/ECS not yet filed)</span>
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {pendingSchedule.map((s) => (
                  <div
                    key={`${s.source_type}-${s.id}`}
                    className="bg-white rounded-lg border border-amber-100 p-2 text-xs space-y-1"
                  >
                    <div className="font-medium text-slate-800 line-clamp-2">{s.equipment_name_description}</div>
                    <div className="text-slate-500 text-xs">
                      {s.source_type === 'PMS' ? 'Preventive' : 'Calibration'}
                      {s.scheduled_date && <> • {s.scheduled_date}</>}
                    </div>
                    <Link
                      to={`/laboratories/${id}/work-requests/new?${new URLSearchParams({
                        source_type: s.source_type,
                        source_schedule_id: s.id,
                        equipment_item_id: s.equipment_item_id || '',
                        equipment_record_id: s.equipment_record_id || '',
                        equipment_name_description: s.equipment_name_description || '',
                        serial_number: s.serial_number || '',
                        nature_of_request: s.source_type === 'PMS' ? 'Preventive' : 'Calibration',
                        date_needed: s.scheduled_date || '',
                      }).toString()}`}
                      className="block w-full text-center bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded px-2 py-1.5"
                    >
                      File EWR
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { PrintHeaderRow, PrintTitleRow, PrintFooter } from '../components/PrintHeaderFooter';
import PrintPages from '../components/PrintPages';
import { StatusChip } from '../utils/inventoryStatus.jsx';

const MIN_ROWS = 10;

// An archived F-LAB-010, exactly as it stood when its period was closed.
//
// Everything on this page comes from inventory_archive_items, never from the
// live items or their Stock Cards, so the form reproduces the same numbers in
// five years as it does today. There is deliberately no edit path.
export default function InventoryArchiveDetail() {
  const { id } = useParams();
  const [archive, setArchive] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/inventory-archives/${id}`)
      .then((res) => setArchive(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load this archived inventory'));
  }, [id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!archive) return <p className="text-slate-500">Loading…</p>;

  const rows = archive.items;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link to="/inventory-archive" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to Inventory Archive
        </Link>
        <button
          onClick={() => window.print()}
          className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          Print F-LAB-010
        </button>
      </div>

      <div className="no-print bg-white border border-slate-200 rounded-xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Inventory Ref.</div>
            <div className="font-mono font-semibold text-slate-800">{archive.reference_no}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Period</div>
            <div className="font-medium text-slate-700">{archive.period_label || archive.inventory_date}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Laboratory</div>
            <div className="font-medium text-slate-700">{archive.laboratory_name}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Items / Variances</div>
            <div className="font-medium text-slate-700">
              {archive.item_count} / {archive.variance_count}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Status</div>
            <StatusChip status="closed" />
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Conducted {archive.inventory_date} by {archive.conducted_by}. Closed{' '}
          {archive.closed_at?.slice(0, 10)} by {archive.closed_by_name}. Each item's Stock Card carries a
          closing annotation naming <span className="font-mono">{archive.reference_no}</span>, and its next
          period opens at the Actual Quantity below.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Read-only. Quantities are frozen as of closing and do not follow later stock movements.
        </p>
      </div>

      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden print:border-none print:rounded-none">
        <div className="p-6 print:hidden">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Inventory Sheet</h2>
          <table className="w-full text-sm border-collapse table-fixed">
            <colgroup>
              <col className="w-[8%]" />
              <col className="w-[32%]" />
              <col className="w-[9%]" />
              <col className="w-[13%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Item No.</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Description</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Unit</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-right">
                  Quantity As per Record
                </th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-right">Actual Quantity</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-right">Variance</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold text-left">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="border border-slate-300 px-3 py-2">{row.item_no}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.description}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.unit}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{row.quantity_recorded}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{row.quantity_actual}</td>
                  <td
                    className={`border border-slate-300 px-3 py-2 text-right ${
                      row.variance ? 'text-amber-700 font-medium' : ''
                    }`}
                  >
                    {row.variance === null || row.variance === undefined ? '' : row.variance}
                  </td>
                  <td className="border border-slate-300 px-3 py-2">{row.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Same F-LAB-010 layout as the live sheet, rendered from the frozen
            rows so the historical form reproduces exactly. */}
        <PrintPages
          rows={rows}
          landscape
          minRows={MIN_ROWS}
          footer={<PrintFooter code="F-LAB-010" date="04-01-25" />}
        >
          {(pageRows, pageIndex, pageCount, startIndex) => (
            <table className="print-page w-full text-xs border-collapse table-fixed">
              <colgroup>
                <col className="w-[8%]" />
                <col className="w-[32%]" />
                <col className="w-[9%]" />
                <col className="w-[13%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <PrintHeaderRow pageLabel={`Page ${pageIndex + 1} of ${pageCount}`} colSpan={7} />
                <PrintTitleRow title="Inventory Sheet" colSpan={7} />
                <tr>
                  <td colSpan={7} className="px-1 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-32 shrink-0">Laboratory:</span>
                      <span>{archive.laboratory_name}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={7} className="px-1 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-32 shrink-0">Prepared by:</span>
                      <span>{archive.conducted_by}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={7} className="px-1 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-32 shrink-0">Inventory Ref.:</span>
                      <span>
                        {archive.reference_no} · {archive.inventory_date} · closed{' '}
                        {archive.closed_at?.slice(0, 10)} by {archive.closed_by_name}
                      </span>
                    </div>
                  </td>
                </tr>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Item No.</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Description</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Unit</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-right break-words">
                    Quantity As per Record
                  </th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-right break-words">
                    Actual Quantity
                  </th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-right break-words">Variance</th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold text-left break-words">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr key={row.id}>
                    <td className="border border-slate-300 px-3 py-2">{row.__blank ? '' : startIndex + i}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.description}</td>
                    <td className="border border-slate-300 px-3 py-2">{row.unit}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right">
                      {row.__blank ? '' : row.quantity_recorded}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right">{row.quantity_actual}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right">
                      {row.variance === null || row.variance === undefined ? '' : row.variance}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">{row.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PrintPages>
      </div>
    </div>
  );
}

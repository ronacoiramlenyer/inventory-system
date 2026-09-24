import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

// The ISO records register: every record the laboratories retain, by code.
//
// Two kinds sit in the list. Most codes name a record the app already
// produces -- a Stock Card is a record the moment an entry is written to it,
// an Incident Report the moment it is filed -- so the register points at
// where those live and counts them. R-LAB-101 and R-LAB-102 have no form
// behind them: the approved budget document is itself the record, and those
// are filed here as attachments.
// Which record a pending-approval count belongs to. The sidebar badge on
// Records is the sum of these, so the register has to say which record it
// came from -- otherwise the badge points at a list of twelve with no clue
// which one is waiting.
const NEEDS_ACTION_BY_CODE = {
  'R-LAB-105': 'filed_requests',
  'R-LAB-108': 'borrowing_requests',
};

export default function Records() {
  const [rows, setRows] = useState(null);
  const [pending, setPending] = useState({});

  useEffect(() => {
    api.get('/records').then((res) => setRows(res.data));
    api
      .get('/notifications/summary')
      .then((res) => setPending(res.data))
      .catch(() => setPending({}));
  }, []);

  if (!rows) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Records</h1>
        <p className="text-sm text-slate-500 mt-1">
          What each laboratory retains, and where to find it. R-LAB-101 and R-LAB-102 are documents filed
          here; every other code is produced by a form the system already holds.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium w-28">Code</th>
              <th className="px-4 py-2 text-left font-medium">Record</th>
              <th className="px-4 py-2 text-left font-medium w-24">Form</th>
              <th className="px-4 py-2 text-left font-medium">Where it lives</th>
              <th className="px-4 py-2 text-right font-medium w-24">On file</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.code} className="hover:bg-slate-50 align-top">
                <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{r.code}</td>
                <td className="px-4 py-3">
                  {r.href ? (
                    <Link to={r.href} className="font-medium text-emerald-700 hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-700">{r.name}</span>
                  )}
                  {pending[NEEDS_ACTION_BY_CODE[r.code]] > 0 && (
                    <span className="ml-2 inline-block rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-xs font-medium align-middle">
                      {pending[NEEDS_ACTION_BY_CODE[r.code]]} waiting on you
                    </span>
                  )}
                  <div className="text-xs text-slate-500 mt-0.5">{r.retains}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                  {r.form || '—'}
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">
                  {r.kind === 'document' ? 'Filed here' : r.where}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {r.count === null ? <span className="text-slate-300">—</span> : r.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Retention periods and disposal are not set here yet — decide how long each record is kept, and this
        is where that belongs.
      </p>
    </div>
  );
}

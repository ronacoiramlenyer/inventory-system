import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

const FORMS = [
  { key: 'bookstore', name: 'Bookstore Requisition Slip', to: '/other-requests/bookstore' },
  { key: 'supplies', name: 'Supplies Requisition Slip', to: '/other-requests/supplies' },
  { key: 'bgu', name: 'BGU Minor/Major Job Request', to: '/other-requests/bgu' },
];

export default function OtherRequestsTabs({ active }) {
  // The parent "Other Requests" nav item only ever showed one combined
  // number for all three request types, which said something needed
  // attention but not which tab to go check -- this breaks that count out
  // per tab instead.
  const [counts, setCounts] = useState({ bookstore: 0, supplies: 0, bgu: 0 });

  useEffect(() => {
    api.get('/notifications/summary').then((res) => {
      if (res.data.other_requests_by_type) setCounts(res.data.other_requests_by_type);
    });
  }, []);

  return (
    <div className="no-print bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex flex-wrap gap-2">
        {FORMS.map((form) => (
          <Link
            key={form.key}
            to={form.to}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${
              active === form.key
                ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {form.name}
            {!!counts[form.key] && (
              <span className="bg-amber-500 text-slate-900 text-xs font-bold rounded-full px-2 py-0.5">
                {counts[form.key]}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

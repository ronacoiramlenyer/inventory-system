import { Link } from 'react-router-dom';

const FORMS = [
  { key: 'bookstore', name: 'Bookstore Requisition Slip', to: '/other-requests/bookstore' },
  { key: 'supplies', name: 'Supplies Requisition Slip', to: '/other-requests/supplies' },
  { key: 'bgu', name: 'BGU Minor/Major Job Request', to: '/other-requests/bgu' },
];

export default function OtherRequestsTabs({ active }) {
  return (
    <div className="no-print bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex flex-wrap gap-2">
        {FORMS.map((form) => (
          <Link
            key={form.key}
            to={form.to}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${
              active === form.key
                ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {form.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

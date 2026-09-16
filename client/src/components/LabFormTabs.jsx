import { Link } from 'react-router-dom';

// One entry per F-LAB form available under a laboratory. Add a new entry here
// as each additional form (F-LAB-001, 002, ...) gets built.
const FORMS = [
  { key: 'inventory-sheet', label: 'F-LAB-010 Inventory Sheet', to: (id) => `/laboratories/${id}` },
  { key: 'stock-cards', label: 'F-LAB-006 Stock Card', to: (id) => `/laboratories/${id}/stock-cards` },
];

export default function LabFormTabs({ laboratoryId, active }) {
  return (
    <div className="no-print flex gap-1 border-b border-slate-200">
      {FORMS.map((form) => (
        <Link
          key={form.key}
          to={form.to(laboratoryId)}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            active === form.key
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {form.label}
        </Link>
      ))}
    </div>
  );
}

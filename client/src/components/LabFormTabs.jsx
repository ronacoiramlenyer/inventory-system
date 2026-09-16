import { Link } from 'react-router-dom';

// One entry per F-LAB form available under a laboratory. Flip `ready` to true
// and give it a real `to` once that form is actually built.
const FORMS = [
  { key: 'inventory-sheet', code: 'F-LAB-010', name: 'Inventory Sheet', to: (id) => `/laboratories/${id}`, ready: true },
  {
    key: 'incident-report',
    code: 'F-LAB-009',
    name: 'Laboratory Incident Report',
    to: (id) => `/laboratories/${id}/incident-reports`,
    ready: true,
  },
  {
    key: 'waste-disposal-log',
    code: 'F-LAB-008',
    name: 'Waste Disposal Log',
    to: (id) => `/laboratories/${id}/waste-disposal-log`,
    ready: true,
  },
  {
    key: 'borrowing-request',
    code: 'F-LAB-007',
    name: 'Borrowing Request Form',
    to: (id) => `/laboratories/${id}/borrowing-requests`,
    ready: true,
  },
  { key: 'stock-cards', code: 'F-LAB-006', name: 'Stock Card', to: (id) => `/laboratories/${id}/stock-cards`, ready: true },
  {
    key: 'equipment-monitoring-sheet',
    code: 'F-LAB-005',
    name: 'Equipment Monitoring Sheet',
    to: (id) => `/laboratories/${id}/work-requests`,
    ready: true,
  },
  {
    key: 'equipment-work-request',
    code: 'F-LAB-004',
    name: 'Equipment Work Request',
    to: (id) => `/laboratories/${id}/work-requests/new`,
    ready: true,
  },
  {
    key: 'equipment-calibration-schedule',
    code: 'F-LAB-003',
    name: 'Equipment Calibration Schedule',
    to: (id) => `/laboratories/${id}/calibration-schedule`,
    ready: true,
  },
  {
    key: 'preventive-maintenance-schedule',
    code: 'F-LAB-002',
    name: 'Preventive Maintenance Schedule',
    to: (id) => `/laboratories/${id}/maintenance-schedule`,
    ready: true,
  },
  {
    key: 'equipment-monitoring-record',
    code: 'F-LAB-001',
    name: 'Equipment Monitoring Record',
    to: (id) => `/laboratories/${id}/equipment`,
    ready: true,
  },
];

export default function LabFormTabs({ laboratoryId, active }) {
  return (
    <div className="no-print bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex flex-wrap gap-2">
        {FORMS.map((form) =>
          form.ready ? (
            <Link
              key={form.key}
              to={form.to(laboratoryId)}
              className={`w-36 rounded-lg border px-3 py-2 text-center ${
                active === form.key
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="text-xs font-semibold leading-tight">{form.code}</div>
              <div className="text-sm font-medium leading-tight">{form.name}</div>
            </Link>
          ) : (
            <span
              key={form.key}
              title="Not built yet"
              className="w-36 rounded-lg border border-slate-100 px-3 py-2 text-center text-slate-300 cursor-not-allowed"
            >
              <div className="text-xs font-semibold leading-tight">{form.code}</div>
              <div className="text-sm font-medium leading-tight">{form.name}</div>
            </span>
          )
        )}
      </div>
    </div>
  );
}

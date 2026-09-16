import { Link } from 'react-router-dom';

// One entry per F-LAB form available under a laboratory. Flip `ready` to true
// and give it a real `to` once that form is actually built.
const FORMS = [
  { key: 'inventory-sheet', label: 'F-LAB-010 Inventory Sheet', to: (id) => `/laboratories/${id}`, ready: true },
  { key: 'incident-report', label: 'F-LAB-009 Laboratory Incident Report', ready: false },
  { key: 'waste-disposal-log', label: 'F-LAB-008 Waste Disposal Log', ready: false },
  { key: 'borrowing-request', label: 'F-LAB-007 Borrowing Request Form', ready: false },
  { key: 'stock-cards', label: 'F-LAB-006 Stock Card', to: (id) => `/laboratories/${id}/stock-cards`, ready: true },
  { key: 'equipment-monitoring-sheet', label: 'F-LAB-005 Equipment Monitoring Sheet', ready: false },
  { key: 'equipment-work-request', label: 'F-LAB-004 Equipment Work Request', ready: false },
  { key: 'equipment-calibration-schedule', label: 'F-LAB-003 Equipment Calibration Schedule', ready: false },
  { key: 'preventive-maintenance-schedule', label: 'F-LAB-002 Preventive Maintenance Schedule', ready: false },
  { key: 'equipment-monitoring-record', label: 'F-LAB-001 Equipment Monitoring Record', ready: false },
];

export default function LabFormTabs({ laboratoryId, active }) {
  return (
    <div className="no-print flex gap-1 border-b border-slate-200 overflow-x-auto">
      {FORMS.map((form) =>
        form.ready ? (
          <Link
            key={form.key}
            to={form.to(laboratoryId)}
            className={`shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              active === form.key
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {form.label}
          </Link>
        ) : (
          <span
            key={form.key}
            title="Not built yet"
            className="shrink-0 px-3 py-2 text-sm font-medium border-b-2 border-transparent text-slate-300 cursor-not-allowed"
          >
            {form.label}
          </span>
        )
      )}
    </div>
  );
}

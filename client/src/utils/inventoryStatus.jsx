// Mirrors worker/src/lib/inventoryPeriod.js -- keep the two in step.
export const STATUS_LABELS = {
  open: 'OPEN',
  counting: 'COUNTING',
  for_reconciliation: 'FOR RECONCILIATION',
  ready_to_close: 'READY TO CLOSE',
  closed: 'CLOSED',
  applied: 'APPLIED (legacy)',
};

export const STATUS_STYLES = {
  open: 'bg-slate-100 text-slate-700 border-slate-300',
  counting: 'bg-sky-100 text-sky-800 border-sky-300',
  for_reconciliation: 'bg-amber-100 text-amber-900 border-amber-300',
  ready_to_close: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  closed: 'bg-slate-800 text-white border-slate-800',
  applied: 'bg-slate-200 text-slate-600 border-slate-300',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || String(status || '').toUpperCase();
}

// The one sentence the person has to agree to before a period is closed.
export const CLOSE_CONFIRMATION =
  'You are about to close this inventory period. The inventory will be archived, the finalized ' +
  'Actual Quantities will become the new recorded quantities, and corresponding Stock Cards will ' +
  'begin a new period using these quantities as Beginning Balances. This action cannot be ' +
  'performed twice for the same inventory period.';

export function StatusChip({ status }) {
  return (
    <span
      className={`inline-block rounded-full border px-3 py-0.5 text-xs font-semibold tracking-wide ${
        STATUS_STYLES[status] || STATUS_STYLES.open
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

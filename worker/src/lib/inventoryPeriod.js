// The states an F-LAB-010 sheet moves through, in order.
//
// open / counting     -- "Quantity as per Record" tracks the live Stock Card
//                        balance, so a receipt booked mid-count is reflected.
// for_reconciliation  -- the cutoff is set: recorded quantities are frozen at
//                        the balances the count was actually taken against,
//                        and variances are reviewed against those.
// ready_to_close      -- every row counted, every variance explained.
// closed              -- archived; the sheet is read-only for good.
export const STATUSES = ['open', 'counting', 'for_reconciliation', 'ready_to_close', 'closed'];

export const STATUS_LABELS = {
  open: 'OPEN',
  counting: 'COUNTING',
  for_reconciliation: 'FOR RECONCILIATION',
  ready_to_close: 'READY TO CLOSE',
  closed: 'CLOSED',
  applied: 'APPLIED (legacy)',
};

// Before the cutoff the recorded quantity is a live read of the Stock Card;
// after it, it is the number the count was signed against.
export function tracksLiveBalance(status) {
  return status === 'open' || status === 'counting';
}

export function isClosed(status) {
  return status === 'closed';
}

// Everything that has to be true before a period may be closed. Returned as
// a list rather than a single message so the sheet can show the custodian
// each outstanding item instead of one at a time.
export function closeBlockers(count, rows) {
  const blockers = [];
  if (!count.reference_no) blockers.push('This sheet has no inventory reference number.');
  if (!count.inventory_date) blockers.push('Set the inventory date before closing.');
  if (!rows.length) blockers.push('This sheet has no items to count.');

  const uncounted = rows.filter((r) => r.quantity_actual === null || r.quantity_actual === undefined);
  if (uncounted.length) {
    blockers.push(
      `${uncounted.length} item${uncounted.length === 1 ? '' : 's'} still ${
        uncounted.length === 1 ? 'has' : 'have'
      } no Actual Quantity (first: "${uncounted[0].description}").`
    );
  }

  // A variance with no explanation is the one thing an auditor will always
  // ask about, so it blocks rather than warns.
  const unexplained = rows.filter(
    (r) => r.quantity_actual !== null && r.quantity_actual !== undefined && r.variance && !r.remarks?.trim()
  );
  if (unexplained.length) {
    blockers.push(
      `${unexplained.length} variance${unexplained.length === 1 ? '' : 's'} need${
        unexplained.length === 1 ? 's' : ''
      } a remark explaining ${unexplained.length === 1 ? 'it' : 'them'} (first: "${unexplained[0].description}").`
    );
  }
  return blockers;
}

// The annotation that closes a Stock Card period. Names the F-LAB-010 it came
// from so an auditor can trace the Stock Card back to the archived sheet and
// the archived sheet forward to the Stock Card.
export function closingRemark(referenceNo, recorded, actual, variance) {
  return (
    `Physical Inventory Conducted – F-LAB-010 ${referenceNo}. ` +
    `Book Balance: ${recorded}. Actual Count: ${actual}. Variance: ${variance > 0 ? '+' : ''}${variance}. ` +
    `Stock Card period closed.`
  );
}

export function openingRemark(referenceNo) {
  return `Beginning Balance after Physical Inventory – F-LAB-010 ${referenceNo}.`;
}

// INV-2026-003. Sequential within the calendar year, across the school, so
// the number on a Stock Card annotation identifies exactly one sheet.
export function formatReferenceNo(year, seq) {
  return `INV-${year}-${String(seq).padStart(3, '0')}`;
}

// "September 2026" -- what the archive listing shows as the period.
export function periodLabelFor(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

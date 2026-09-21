import { Hono } from 'hono';
import { dbGet } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

// How many "actionable" items sit in each request table right now, split
// into what an approver (Subject Coordinator/admin) needs to act on
// (Pending) and what an updater (Secretary/admin) needs to act on (Filed
// but not yet at a terminal status). Mirrors the access rules already
// enforced in work-requests.js / requisitions.js / bgu-job-requests.js --
// this endpoint only counts, it doesn't grant any new access.
const NON_TERMINAL_FILED = {
  work_requests: ['Filed', 'In Progress'],
  bookstore_requisitions: ['Filed', 'In Progress'],
  supplies_requisitions: ['Filed', 'In Progress'],
  bgu_job_requests: ['Filed', 'In Progress'],
  // F-LAB-007 runs Pending -> Approved -> Returned rather than the Filed
  // workflow above, so "not finished yet" here means Approved: the borrower
  // has it and the custodian is still waiting on it coming back.
  borrowing_requests: ['Approved'],
};

const notifications = new Hono();
notifications.use('*', requireAuth);

async function tableCounts(db, table, user) {
  const clauses = ["l.status = 'approved'"];
  const scopeParams = [];

  if (user.role === 'secretary') {
    const ids = (user.department_ids || []).map(Number);
    if (!ids.length) return { pending: 0, filed: 0, inProgress: 0 };
    clauses.push(`l.department_id IN (${ids.map(() => '?').join(',')})`);
    scopeParams.push(...ids);
  } else if (user.role !== 'admin') {
    clauses.push('l.department_id = ?');
    scopeParams.push(user.department_id);
  }

  const nonTerminal = NON_TERMINAL_FILED[table];
  const filedPlaceholders = nonTerminal.map(() => '?').join(',');

  const row = await dbGet(
    db,
    `SELECT
       COALESCE(SUM(CASE WHEN t.status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending,
       COALESCE(SUM(CASE WHEN t.status IN (${filedPlaceholders}) THEN 1 ELSE 0 END), 0) AS filed,
       COALESCE(SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END), 0) AS in_progress
     FROM \`${table}\` t
     JOIN laboratories l ON l.id = t.laboratory_id
     WHERE ${clauses.join(' AND ')}`,
    ...nonTerminal,
    ...scopeParams
  );
  return { pending: row?.pending || 0, filed: row?.filed || 0, inProgress: row?.in_progress || 0 };
}

notifications.get('/summary', async (c) => {
  const user = c.get('user');

  // Same roles that can approve/manage in the request routes themselves.
  const canApprove = user.role === 'admin' || user.role === 'subject_coordinator';
  const canManageFiled = user.role === 'admin' || user.role === 'secretary';
  // Staff is the one who marks an EWR Completed / a requisition Released /
  // a BGU job Completed once the Secretary has it In Progress -- see
  // userCanCompleteWork / userCanCompleteRequest in work-requests.js and
  // requisitions.js -- so an In-Progress one shows up for staff too,
  // alongside the Secretary, until staff finishes it and it drops off both.
  const canCompleteWork = user.role === 'staff';

  if (!canApprove && !canManageFiled && !canCompleteWork) {
    return c.json({
      other_requests: 0,
      filed_requests: 0,
      borrowing_requests: 0,
      other_requests_by_type: { bookstore: 0, supplies: 0, bgu: 0 },
    });
  }

  const [workRequests, bookstore, supplies, bgu, borrowing] = await Promise.all([
    tableCounts(c.env.DB, 'work_requests', user),
    tableCounts(c.env.DB, 'bookstore_requisitions', user),
    tableCounts(c.env.DB, 'supplies_requisitions', user),
    tableCounts(c.env.DB, 'bgu_job_requests', user),
    tableCounts(c.env.DB, 'borrowing_requests', user),
  ]);

  const otherRequests =
    (canApprove ? bookstore.pending + supplies.pending + bgu.pending : 0) +
    (canManageFiled ? bookstore.filed + supplies.filed + bgu.filed : 0) +
    (canCompleteWork ? bookstore.inProgress + supplies.inProgress + bgu.inProgress : 0);
  const filedRequests =
    (canApprove ? workRequests.pending : 0) +
    (canManageFiled ? workRequests.filed : 0) +
    (canCompleteWork ? workRequests.inProgress : 0);

  // Per-type breakdown so the "Other Requests" tabs (Bookstore/Supplies/BGU)
  // can each show their own badge instead of one combined number on the
  // parent nav item, which didn't say which request type actually needs
  // attention.
  const countFor = (t) => (canApprove ? t.pending : 0) + (canManageFiled ? t.filed : 0) + (canCompleteWork ? t.inProgress : 0);
  const other_requests_by_type = {
    bookstore: countFor(bookstore),
    supplies: countFor(supplies),
    bgu: countFor(bgu),
  };

  // F-LAB-007: an approver acts on Pending, and the custodian is the one
  // chasing an Approved one back, so each sees only their own half.
  const borrowingRequests =
    (canApprove ? borrowing.pending : 0) + (canCompleteWork ? borrowing.filed : 0);

  return c.json({
    other_requests: otherRequests,
    filed_requests: filedRequests,
    borrowing_requests: borrowingRequests,
    other_requests_by_type,
  });
});

export default notifications;

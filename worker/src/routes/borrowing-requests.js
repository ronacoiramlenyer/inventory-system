import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';
import { addSignedCopyRoutes } from '../lib/signedCopy.js';

// F-LAB-007 Borrowing Request Form: a borrowing event (who, purpose, dates)
// plus a list of items/equipment borrowed and their condition on return.
const borrowingRequests = new Hono();
borrowingRequests.use('*', requireAuth);

const SELECT = `
  SELECT b.*, l.name AS laboratory_name, l.department_id, l.status AS lab_status, d.name AS department_name,
    au.username AS approved_by_username, su.full_name AS signed_copy_uploaded_by_name
  FROM borrowing_requests b
  JOIN laboratories l ON l.id = b.laboratory_id
  JOIN departments d ON d.id = l.department_id
  LEFT JOIN users au ON au.id = b.approved_by_id
  LEFT JOIN users su ON su.id = b.signed_copy_uploaded_by
`;

function labAccessibleToUser(user, lab) {
  if (!lab) return false;
  if (user.role === 'admin') return true;
  return Number(lab.department_id) === Number(user.department_id) && lab.status === 'approved';
}

function userCanAccessRow(user, row) {
  if (!row) return false;
  if (user.role === 'admin') return true;
  return Number(row.department_id) === Number(user.department_id) && row.lab_status === 'approved';
}

// Only an admin, or the Subject Coordinator of the request's own
// department, may approve a borrowing request.
function userCanApprove(user, row) {
  if (!row) return false;
  if (user.role === 'admin') return true;
  return user.role === 'subject_coordinator' && Number(row.department_id) === Number(user.department_id);
}

async function nextReferenceNo(db) {
  const year = new Date().getFullYear();
  const prefix = `BRF-${year}-`;
  const row = await dbGet(db, `SELECT COUNT(*) AS n FROM borrowing_requests WHERE reference_no LIKE ?`, `${prefix}%`);
  const seq = String(row.n + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

borrowingRequests.get('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id } = c.req.query();
  const clauses = [];
  const params = [];

  if (user.role !== 'admin') {
    clauses.push('l.department_id = ?', "l.status = 'approved'");
    params.push(user.department_id);
  }
  if (laboratory_id) {
    clauses.push('b.laboratory_id = ?');
    params.push(laboratory_id);
  }

  let sql = SELECT;
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY b.created_at DESC';

  return c.json(await dbAll(c.env.DB, sql, ...params));
});

borrowingRequests.get('/:id', async (c) => {
  const user = c.get('user');
  const row = await dbGet(c.env.DB, SELECT + ' WHERE b.id = ?', c.req.param('id'));
  if (!row) return c.json({ error: 'Borrowing request not found' }, 404);
  if (!userCanAccessRow(user, row)) {
    return c.json({ error: 'You do not have access to this borrowing request' }, 403);
  }
  const items = await dbAll(
    c.env.DB,
    'SELECT * FROM borrowing_request_items WHERE borrowing_request_id = ? ORDER BY item_no',
    row.id
  );
  return c.json({ ...row, items });
});

borrowingRequests.post('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id, borrower_name, department_unit, date_needed, purpose, return_date, items } =
    await c.req.json().catch(() => ({}));

  if (!laboratory_id || !borrower_name?.trim()) {
    return c.json({ error: 'laboratory_id and borrower_name are required' }, 400);
  }

  const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
  if (!labAccessibleToUser(user, lab)) {
    return c.json({ error: 'You do not have access to that laboratory' }, 403);
  }

  const referenceNo = await nextReferenceNo(c.env.DB);

  const result = await dbRun(
    c.env.DB,
    `INSERT INTO borrowing_requests (laboratory_id, reference_no, borrower_name, department_unit, date_needed, purpose, return_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    laboratory_id,
    referenceNo,
    borrower_name.trim(),
    department_unit?.trim() || null,
    date_needed || null,
    purpose?.trim() || null,
    return_date || null,
    user.id
  );
  const requestId = result.lastInsertRowid;

  let itemNo = 1;
  for (const item of items || []) {
    if (!item.description?.trim()) continue;
    await dbRun(
      c.env.DB,
      `INSERT INTO borrowing_request_items (borrowing_request_id, item_no, description, equipment_id_text)
       VALUES (?, ?, ?, ?)`,
      requestId,
      itemNo++,
      item.description.trim(),
      item.equipment_id_text?.trim() || null
    );
  }

  const created = await dbGet(c.env.DB, SELECT + ' WHERE b.id = ?', requestId);
  const rows = await dbAll(
    c.env.DB,
    'SELECT * FROM borrowing_request_items WHERE borrowing_request_id = ? ORDER BY item_no',
    requestId
  );
  return c.json({ ...created, items: rows }, 201);
});

// Subject Coordinator (or admin) approval: the approver's identity/time is
// always taken from their own authenticated account, never from client
// input, so "Approved by" can't be spoofed by typing someone else's name.
borrowingRequests.post('/:id/approve', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, SELECT + ' WHERE b.id = ?', id);
  if (!existing) return c.json({ error: 'Borrowing request not found' }, 404);
  if (!userCanApprove(user, existing)) {
    return c.json({ error: 'Only the Subject Coordinator for this department can approve this request' }, 403);
  }
  if (existing.status !== 'Pending') {
    return c.json({ error: `This request is already ${existing.status}` }, 400);
  }

  await dbRun(
    c.env.DB,
    `UPDATE borrowing_requests SET status = 'Approved', approved_by = ?, approved_by_id = ?, approved_at = ? WHERE id = ?`,
    user.full_name,
    user.id,
    new Date().toISOString(),
    id
  );
  return c.json(await dbGet(c.env.DB, SELECT + ' WHERE b.id = ?', id));
});

borrowingRequests.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, SELECT + ' WHERE b.id = ?', id);
  if (!existing) return c.json({ error: 'Borrowing request not found' }, 404);
  if (!userCanAccessRow(user, existing)) {
    return c.json({ error: 'You do not have access to this borrowing request' }, 403);
  }

  const { borrower_name, department_unit, date_needed, purpose, return_date, status, items } =
    await c.req.json().catch(() => ({}));

  // Moving to Approved has to go through the /approve action so the
  // approver's identity is captured from their real account -- this route
  // can move it anywhere else (e.g. Returned).
  if (status === 'Approved' && existing.status !== 'Approved') {
    return c.json({ error: 'Use the Approve action to approve this request' }, 400);
  }

  await dbRun(
    c.env.DB,
    `UPDATE borrowing_requests SET borrower_name = ?, department_unit = ?, date_needed = ?, purpose = ?,
       return_date = ?, status = ? WHERE id = ?`,
    borrower_name?.trim() || existing.borrower_name,
    department_unit?.trim() ?? existing.department_unit,
    date_needed ?? existing.date_needed,
    purpose?.trim() ?? existing.purpose,
    return_date ?? existing.return_date,
    status?.trim() || existing.status,
    id
  );

  for (const item of items || []) {
    if (!item.id) continue;
    await dbRun(
      c.env.DB,
      `UPDATE borrowing_request_items SET returned_condition = ? WHERE id = ? AND borrowing_request_id = ?`,
      item.returned_condition?.trim() || null,
      item.id,
      id
    );
  }

  const updated = await dbGet(c.env.DB, SELECT + ' WHERE b.id = ?', id);
  const rows = await dbAll(
    c.env.DB,
    'SELECT * FROM borrowing_request_items WHERE borrowing_request_id = ? ORDER BY item_no',
    id
  );
  return c.json({ ...updated, items: rows });
});

borrowingRequests.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, SELECT + ' WHERE b.id = ?', id);
  if (!existing) return c.json({ error: 'Borrowing request not found' }, 404);
  if (!userCanAccessRow(user, existing)) {
    return c.json({ error: 'You do not have access to this borrowing request' }, 403);
  }
  await dbRun(c.env.DB, 'DELETE FROM borrowing_requests WHERE id = ?', id);
  return c.body(null, 204);
});

addSignedCopyRoutes(borrowingRequests, {
  table: 'borrowing_requests',
  getRow: (db, id) => dbGet(db, SELECT + ' WHERE b.id = ?', id),
  keyPrefix: 'borrowing-requests',
  userCanAccessRow,
});

export default borrowingRequests;

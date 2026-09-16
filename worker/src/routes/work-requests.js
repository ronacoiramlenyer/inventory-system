import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';
import { sendWorkRequestEmail } from '../lib/email.js';

// F-LAB-004 Equipment Work Request (the official per-request form) and
// F-LAB-005 Equipment Monitoring Sheet (the per-lab log of those requests)
// are two views over this one table.
const workRequests = new Hono();
workRequests.use('*', requireAuth);

const SELECT = `
  SELECT w.*, l.name AS laboratory_name, l.department_id, l.status AS lab_status, d.name AS department_name
  FROM work_requests w
  JOIN laboratories l ON l.id = w.laboratory_id
  JOIN departments d ON d.id = l.department_id
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

async function nextRequestNo(db) {
  const year = new Date().getFullYear();
  const prefix = `EWR-${year}-`;
  const row = await dbGet(
    db,
    `SELECT COUNT(*) AS n FROM work_requests WHERE request_no LIKE ?`,
    `${prefix}%`
  );
  const seq = String(row.n + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

workRequests.get('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id } = c.req.query();
  const clauses = [];
  const params = [];

  if (user.role !== 'admin') {
    clauses.push('l.department_id = ?', "l.status = 'approved'");
    params.push(user.department_id);
  }
  if (laboratory_id) {
    clauses.push('w.laboratory_id = ?');
    params.push(laboratory_id);
  }

  let sql = SELECT;
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY w.created_at DESC';

  return c.json(await dbAll(c.env.DB, sql, ...params));
});

workRequests.get('/:id', async (c) => {
  const user = c.get('user');
  const row = await dbGet(c.env.DB, SELECT + ' WHERE w.id = ?', c.req.param('id'));
  if (!row) return c.json({ error: 'Work request not found' }, 404);
  if (!userCanAccessRow(user, row)) {
    return c.json({ error: 'You do not have access to this work request' }, 403);
  }
  return c.json(row);
});

workRequests.post('/', async (c) => {
  const user = c.get('user');
  const {
    laboratory_id,
    equipment_name_description,
    serial_number,
    date_needed,
    nature_of_request,
    detailed_description,
    requested_by,
  } = await c.req.json().catch(() => ({}));

  if (!laboratory_id || !equipment_name_description?.trim()) {
    return c.json({ error: 'laboratory_id and equipment_name_description are required' }, 400);
  }

  const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
  if (!labAccessibleToUser(user, lab)) {
    return c.json({ error: 'You do not have access to that laboratory' }, 403);
  }

  const requestNo = await nextRequestNo(c.env.DB);
  const today = new Date().toISOString().slice(0, 10);

  const result = await dbRun(
    c.env.DB,
    `INSERT INTO work_requests
      (laboratory_id, request_no, equipment_name_description, serial_number, date_requested, date_needed,
       nature_of_request, detailed_description, requested_by, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    laboratory_id,
    requestNo,
    equipment_name_description.trim(),
    serial_number?.trim() || null,
    today,
    date_needed || null,
    nature_of_request?.trim() || null,
    detailed_description?.trim() || null,
    requested_by?.trim() || user.full_name,
    // Submitting the EWR form means it's immediately filed and routed to the secretary.
    'Filed',
    user.id
  );
  const created = await dbGet(c.env.DB, SELECT + ' WHERE w.id = ?', result.lastInsertRowid);
  const emailResult = await sendWorkRequestEmail(c.env, created);
  return c.json({ ...created, email_sent: emailResult.sent, email_error: emailResult.error }, 201);
});

workRequests.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, SELECT + ' WHERE w.id = ?', id);
  if (!existing) return c.json({ error: 'Work request not found' }, 404);
  if (!userCanAccessRow(user, existing)) {
    return c.json({ error: 'You do not have access to this work request' }, 403);
  }

  const {
    equipment_name_description,
    serial_number,
    date_needed,
    nature_of_request,
    detailed_description,
    requested_by,
    approved_by,
    status,
    date_completed,
    remarks,
  } = await c.req.json().catch(() => ({}));

  await dbRun(
    c.env.DB,
    `UPDATE work_requests SET equipment_name_description = ?, serial_number = ?, date_needed = ?,
       nature_of_request = ?, detailed_description = ?, requested_by = ?, approved_by = ?, status = ?,
       date_completed = ?, remarks = ? WHERE id = ?`,
    equipment_name_description?.trim() || existing.equipment_name_description,
    serial_number?.trim() ?? existing.serial_number,
    date_needed ?? existing.date_needed,
    nature_of_request?.trim() ?? existing.nature_of_request,
    detailed_description?.trim() ?? existing.detailed_description,
    requested_by?.trim() ?? existing.requested_by,
    approved_by?.trim() ?? existing.approved_by,
    status?.trim() || existing.status,
    date_completed ?? existing.date_completed,
    remarks?.trim() ?? existing.remarks,
    id
  );
  return c.json(await dbGet(c.env.DB, SELECT + ' WHERE w.id = ?', id));
});

workRequests.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, SELECT + ' WHERE w.id = ?', id);
  if (!existing) return c.json({ error: 'Work request not found' }, 404);
  if (!userCanAccessRow(user, existing)) {
    return c.json({ error: 'You do not have access to this work request' }, 403);
  }
  await dbRun(c.env.DB, 'DELETE FROM work_requests WHERE id = ?', id);
  return c.body(null, 204);
});

export default workRequests;

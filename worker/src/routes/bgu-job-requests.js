import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

// BGU Minor and Major Job Request: same Pending -> Subject Coordinator
// approval -> Filed -> Secretary fulfillment workflow as F-LAB-004.
const bguJobRequests = new Hono();
bguJobRequests.use('*', requireAuth);

const SELECT = `
  SELECT b.*, l.name AS laboratory_name, l.department_id, l.status AS lab_status, d.name AS department_name
  FROM bgu_job_requests b
  JOIN laboratories l ON l.id = b.laboratory_id
  JOIN departments d ON d.id = l.department_id
`;

function inUserScope(user, row) {
  if (user.role === 'secretary') {
    return (user.department_ids || []).map(Number).includes(Number(row.department_id));
  }
  return Number(row.department_id) === Number(user.department_id);
}

function labAccessibleToUser(user, lab) {
  if (!lab) return false;
  if (user.role === 'admin') return true;
  return inUserScope(user, lab) && lab.status === 'approved';
}

function userCanAccessRow(user, row) {
  if (!row) return false;
  if (user.role === 'admin') return true;
  if (!inUserScope(user, row) || row.lab_status !== 'approved') return false;
  if (user.role === 'secretary') return row.status !== 'Pending';
  return true;
}

function userCanApprove(user, row) {
  if (!row) return false;
  if (user.role === 'admin') return true;
  return user.role === 'subject_coordinator' && inUserScope(user, row);
}

function userCanManageFiled(user, row) {
  if (!row) return false;
  if (userCanApprove(user, row)) return true;
  return user.role === 'secretary' && inUserScope(user, row);
}

bguJobRequests.get('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id } = c.req.query();
  const clauses = [];
  const params = [];

  if (user.role === 'secretary') {
    const departmentIds = user.department_ids || [];
    const placeholders = departmentIds.map(() => '?').join(',') || 'NULL';
    clauses.push(`l.department_id IN (${placeholders})`, "l.status = 'approved'", "b.status != 'Pending'");
    params.push(...departmentIds);
  } else if (user.role !== 'admin') {
    clauses.push('l.department_id = ?', "l.status = 'approved'");
    params.push(user.department_id);
  }
  if (laboratory_id) {
    clauses.push('b.laboratory_id = ?');
    params.push(laboratory_id);
  }

  let sql = SELECT;
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY b.request_date DESC, b.id DESC';

  return c.json(await dbAll(c.env.DB, sql, ...params));
});

bguJobRequests.post('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id, request_date, job_classification, description, requested_by } =
    await c.req.json().catch(() => ({}));
  if (!laboratory_id || !request_date || !job_classification || !description?.trim()) {
    return c.json({ error: 'laboratory_id, request_date, job_classification and description are required' }, 400);
  }
  if (!['Minor', 'Major'].includes(job_classification)) {
    return c.json({ error: 'job_classification must be Minor or Major' }, 400);
  }

  const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
  if (!labAccessibleToUser(user, lab)) {
    return c.json({ error: 'You do not have access to that laboratory' }, 403);
  }

  const result = await dbRun(
    c.env.DB,
    `INSERT INTO bgu_job_requests (laboratory_id, request_date, job_classification, description, requested_by, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    laboratory_id,
    request_date,
    job_classification,
    description.trim(),
    requested_by?.trim() || user.full_name,
    'Pending',
    user.id
  );
  return c.json(await dbGet(c.env.DB, SELECT + ' WHERE b.id = ?', result.lastInsertRowid), 201);
});

bguJobRequests.post('/:id/approve', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, SELECT + ' WHERE b.id = ?', id);
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (!userCanApprove(user, existing)) {
    return c.json({ error: 'Only the Subject Coordinator for this department can approve this request' }, 403);
  }
  if (existing.status !== 'Pending') {
    return c.json({ error: `This request is already ${existing.status}` }, 400);
  }

  await dbRun(c.env.DB, `UPDATE bgu_job_requests SET status = 'Filed', approved_by = ? WHERE id = ?`, user.full_name, id);
  return c.json(await dbGet(c.env.DB, SELECT + ' WHERE b.id = ?', id));
});

bguJobRequests.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, SELECT + ' WHERE b.id = ?', id);
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (!userCanAccessRow(user, existing)) {
    return c.json({ error: 'You do not have access to this job request' }, 403);
  }

  const { request_date, job_classification, description, requested_by, approved_by, status } =
    await c.req.json().catch(() => ({}));
  if (job_classification && !['Minor', 'Major'].includes(job_classification)) {
    return c.json({ error: 'job_classification must be Minor or Major' }, 400);
  }

  const canApprove = userCanApprove(user, existing);
  const canManage = userCanManageFiled(user, existing);

  await dbRun(
    c.env.DB,
    `UPDATE bgu_job_requests SET request_date = ?, job_classification = ?, description = ?,
       requested_by = ?, approved_by = ?, status = ? WHERE id = ?`,
    request_date || existing.request_date,
    job_classification || existing.job_classification,
    description?.trim() || existing.description,
    requested_by?.trim() ?? existing.requested_by,
    canApprove ? approved_by?.trim() ?? existing.approved_by : existing.approved_by,
    canManage ? status || existing.status : existing.status,
    id
  );
  return c.json(await dbGet(c.env.DB, SELECT + ' WHERE b.id = ?', id));
});

bguJobRequests.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, SELECT + ' WHERE b.id = ?', id);
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (!userCanAccessRow(user, existing)) {
    return c.json({ error: 'You do not have access to this job request' }, 403);
  }
  if (existing.status !== 'Pending' && user.role !== 'admin') {
    return c.json({ error: 'Only an admin can delete a filed request' }, 403);
  }
  await dbRun(c.env.DB, 'DELETE FROM bgu_job_requests WHERE id = ?', id);
  return c.body(null, 204);
});

export default bguJobRequests;

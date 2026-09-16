import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const laboratories = new Hono();
laboratories.use('*', requireAuth);

const LAB_SELECT = `
  SELECT l.*, d.name AS department_name,
    (SELECT COUNT(*) FROM items i WHERE i.laboratory_id = l.id) AS item_count,
    ru.full_name AS requested_by_name,
    rv.full_name AS reviewed_by_name
  FROM laboratories l
  JOIN departments d ON d.id = l.department_id
  LEFT JOIN users ru ON ru.id = l.requested_by
  LEFT JOIN users rv ON rv.id = l.reviewed_by
`;

function assertDepartmentAccess(user, departmentId) {
  return user.role === 'admin' || Number(user.department_id) === Number(departmentId);
}

laboratories.get('/', async (c) => {
  const user = c.get('user');
  const { department_id, status } = c.req.query();
  const clauses = [];
  const params = [];

  if (user.role !== 'admin') {
    clauses.push('l.department_id = ?');
    params.push(user.department_id);
  } else if (department_id) {
    clauses.push('l.department_id = ?');
    params.push(department_id);
  }

  if (status) {
    clauses.push('l.status = ?');
    params.push(status);
  }

  let sql = LAB_SELECT;
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += " ORDER BY (l.status = 'pending') DESC, l.name";

  return c.json(await dbAll(c.env.DB, sql, ...params));
});

laboratories.get('/:id', async (c) => {
  const user = c.get('user');
  const lab = await dbGet(c.env.DB, LAB_SELECT + ' WHERE l.id = ?', c.req.param('id'));
  if (!lab) return c.json({ error: 'Laboratory not found' }, 404);
  if (!assertDepartmentAccess(user, lab.department_id)) {
    return c.json({ error: 'You do not have access to this laboratory' }, 403);
  }
  return c.json(lab);
});

laboratories.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { name, location } = body;
  if (!name?.trim()) return c.json({ error: 'name is required' }, 400);

  let departmentId = user.department_id;
  if (user.role === 'admin') {
    departmentId = body.department_id;
    if (!departmentId) return c.json({ error: 'department_id is required' }, 400);
  } else if (!departmentId) {
    return c.json({ error: 'Your account is not assigned to a department' }, 400);
  }

  const isAdmin = user.role === 'admin';
  try {
    const result = await dbRun(
      c.env.DB,
      `INSERT INTO laboratories (name, department_id, location, status, requested_by, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      name.trim(),
      departmentId,
      location?.trim() || null,
      isAdmin ? 'approved' : 'pending',
      user.id,
      isAdmin ? user.id : null,
      isAdmin ? new Date().toISOString() : null
    );
    return c.json(await dbGet(c.env.DB, LAB_SELECT + ' WHERE l.id = ?', result.lastInsertRowid), 201);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return c.json({ error: 'A laboratory with that name already exists in this department' }, 409);
    }
    return c.json({ error: 'Failed to create laboratory' }, 500);
  }
});

laboratories.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Laboratory not found' }, 404);
  if (!assertDepartmentAccess(user, existing.department_id)) {
    return c.json({ error: 'You do not have access to this laboratory' }, 403);
  }
  const { name, location } = await c.req.json().catch(() => ({}));
  await dbRun(
    c.env.DB,
    'UPDATE laboratories SET name = ?, location = ? WHERE id = ?',
    name?.trim() || existing.name,
    location?.trim() ?? existing.location,
    id
  );
  return c.json(await dbGet(c.env.DB, LAB_SELECT + ' WHERE l.id = ?', id));
});

laboratories.post('/:id/approve', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Laboratory not found' }, 404);
  await dbRun(
    c.env.DB,
    `UPDATE laboratories SET status = 'approved', reviewed_by = ?, reviewed_at = ?, rejection_reason = NULL WHERE id = ?`,
    user.id,
    new Date().toISOString(),
    id
  );
  return c.json(await dbGet(c.env.DB, LAB_SELECT + ' WHERE l.id = ?', id));
});

laboratories.post('/:id/reject', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Laboratory not found' }, 404);
  const { reason } = await c.req.json().catch(() => ({}));
  await dbRun(
    c.env.DB,
    `UPDATE laboratories SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, rejection_reason = ? WHERE id = ?`,
    user.id,
    new Date().toISOString(),
    reason?.trim() || null,
    id
  );
  return c.json(await dbGet(c.env.DB, LAB_SELECT + ' WHERE l.id = ?', id));
});

laboratories.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Laboratory not found' }, 404);
  await dbRun(c.env.DB, 'DELETE FROM laboratories WHERE id = ?', id);
  return c.body(null, 204);
});

export default laboratories;

import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const departments = new Hono();
departments.use('*', requireAuth);

departments.get('/', async (c) => {
  const rows = await dbAll(
    c.env.DB,
    `SELECT d.*,
      (SELECT COUNT(*) FROM laboratories l WHERE l.department_id = d.id AND l.status = 'approved') AS laboratory_count,
      (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id) AS staff_count
     FROM departments d ORDER BY d.name`
  );
  return c.json(rows);
});

departments.post('/', requireAdmin, async (c) => {
  const { name } = await c.req.json().catch(() => ({}));
  if (!name?.trim()) return c.json({ error: 'name is required' }, 400);
  try {
    const result = await dbRun(c.env.DB, 'INSERT INTO departments (name) VALUES (?)', name.trim());
    const dept = await dbGet(c.env.DB, 'SELECT * FROM departments WHERE id = ?', result.lastInsertRowid);
    return c.json(dept, 201);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return c.json({ error: 'A department with that name already exists' }, 409);
    }
    return c.json({ error: 'Failed to create department' }, 500);
  }
});

departments.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, 'SELECT * FROM departments WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Department not found' }, 404);
  const { name } = await c.req.json().catch(() => ({}));
  await dbRun(c.env.DB, 'UPDATE departments SET name = ? WHERE id = ?', name?.trim() || existing.name, id);
  return c.json(await dbGet(c.env.DB, 'SELECT * FROM departments WHERE id = ?', id));
});

departments.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, 'SELECT * FROM departments WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Department not found' }, 404);
  await dbRun(c.env.DB, 'DELETE FROM departments WHERE id = ?', id);
  return c.body(null, 204);
});

export default departments;

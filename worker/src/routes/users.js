import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const users = new Hono();
users.use('*', requireAuth, requireAdmin);

const USER_SELECT = `
  SELECT u.id, u.full_name, u.username, u.role, u.department_id, u.created_at, d.name AS department_name
  FROM users u LEFT JOIN departments d ON d.id = u.department_id
`;

const VALID_ROLES = ['admin', 'staff', 'subject_coordinator'];

users.get('/', async (c) => {
  const rows = await dbAll(c.env.DB, USER_SELECT + ' ORDER BY u.role DESC, u.full_name');
  return c.json(rows);
});

users.post('/', async (c) => {
  const { full_name, username, password, role, department_id } = await c.req.json().catch(() => ({}));
  if (!full_name?.trim() || !username?.trim() || !password) {
    return c.json({ error: 'full_name, username and password are required' }, 400);
  }
  const normalizedRole = VALID_ROLES.includes(role) ? role : 'staff';
  if (normalizedRole !== 'admin' && !department_id) {
    return c.json({ error: 'Staff and Subject Coordinator accounts must be assigned a department' }, 400);
  }
  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const result = await dbRun(
      c.env.DB,
      `INSERT INTO users (full_name, username, password_hash, role, department_id) VALUES (?, ?, ?, ?, ?)`,
      full_name.trim(),
      username.trim(),
      passwordHash,
      normalizedRole,
      normalizedRole !== 'admin' ? department_id : null
    );
    const user = await dbGet(c.env.DB, USER_SELECT + ' WHERE u.id = ?', result.lastInsertRowid);
    return c.json(user, 201);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return c.json({ error: 'That username is already taken' }, 409);
    }
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

users.put('/:id', async (c) => {
  const id = c.req.param('id');
  const currentUser = c.get('user');
  const existing = await dbGet(c.env.DB, 'SELECT * FROM users WHERE id = ?', id);
  if (!existing) return c.json({ error: 'User not found' }, 404);

  const { full_name, role, department_id, password } = await c.req.json().catch(() => ({}));
  const normalizedRole = VALID_ROLES.includes(role) ? role : existing.role;
  const newDepartmentId = normalizedRole !== 'admin' ? department_id ?? existing.department_id : null;

  if (normalizedRole !== 'admin' && !newDepartmentId) {
    return c.json({ error: 'Staff and Subject Coordinator accounts must be assigned a department' }, 400);
  }
  if (currentUser.id === Number(id) && normalizedRole !== 'admin') {
    return c.json({ error: 'You cannot demote your own admin account' }, 400);
  }

  await dbRun(
    c.env.DB,
    'UPDATE users SET full_name = ?, role = ?, department_id = ? WHERE id = ?',
    full_name?.trim() || existing.full_name,
    normalizedRole,
    newDepartmentId,
    id
  );

  if (password) {
    const passwordHash = bcrypt.hashSync(password, 10);
    await dbRun(c.env.DB, 'UPDATE users SET password_hash = ? WHERE id = ?', passwordHash, id);
  }

  return c.json(await dbGet(c.env.DB, USER_SELECT + ' WHERE u.id = ?', id));
});

users.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const currentUser = c.get('user');
  if (currentUser.id === Number(id)) {
    return c.json({ error: 'You cannot delete your own account' }, 400);
  }
  const existing = await dbGet(c.env.DB, 'SELECT * FROM users WHERE id = ?', id);
  if (!existing) return c.json({ error: 'User not found' }, 404);
  await dbRun(c.env.DB, 'DELETE FROM users WHERE id = ?', id);
  return c.body(null, 204);
});

export default users;

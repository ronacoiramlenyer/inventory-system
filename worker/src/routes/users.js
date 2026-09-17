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

const VALID_ROLES = ['admin', 'staff', 'subject_coordinator', 'secretary'];

// A Secretary can cover several departments (unlike staff/Subject
// Coordinator, who each have exactly one via users.department_id), so her
// coverage is attached from the secretary_departments join table instead.
async function withSecretaryDepartments(db, rows) {
  const secretaryIds = rows.filter((r) => r.role === 'secretary').map((r) => r.id);
  if (secretaryIds.length === 0) return rows;

  const placeholders = secretaryIds.map(() => '?').join(',');
  const links = await dbAll(
    db,
    `SELECT sd.user_id, sd.department_id, d.name AS department_name
     FROM secretary_departments sd JOIN departments d ON d.id = sd.department_id
     WHERE sd.user_id IN (${placeholders})
     ORDER BY d.name`,
    ...secretaryIds
  );
  const byUser = new Map();
  for (const link of links) {
    if (!byUser.has(link.user_id)) byUser.set(link.user_id, []);
    byUser.get(link.user_id).push({ id: link.department_id, name: link.department_name });
  }
  return rows.map((r) => (r.role === 'secretary' ? { ...r, departments: byUser.get(r.id) || [] } : r));
}

async function setSecretaryDepartments(db, userId, departmentIds) {
  await dbRun(db, 'DELETE FROM secretary_departments WHERE user_id = ?', userId);
  for (const departmentId of departmentIds) {
    await dbRun(
      db,
      'INSERT INTO secretary_departments (user_id, department_id) VALUES (?, ?)',
      userId,
      departmentId
    );
  }
}

users.get('/', async (c) => {
  const rows = await dbAll(c.env.DB, USER_SELECT + ' ORDER BY u.role DESC, u.full_name');
  return c.json(await withSecretaryDepartments(c.env.DB, rows));
});

users.post('/', async (c) => {
  const { full_name, username, password, role, department_id, department_ids } = await c.req.json().catch(() => ({}));
  if (!full_name?.trim() || !username?.trim() || !password) {
    return c.json({ error: 'full_name, username and password are required' }, 400);
  }
  const normalizedRole = VALID_ROLES.includes(role) ? role : 'staff';

  if (normalizedRole === 'secretary') {
    if (!Array.isArray(department_ids) || department_ids.length === 0) {
      return c.json({ error: 'A Secretary account must be assigned at least one department' }, 400);
    }
  } else if (normalizedRole !== 'admin' && !department_id) {
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
      normalizedRole === 'staff' || normalizedRole === 'subject_coordinator' ? department_id : null
    );
    if (normalizedRole === 'secretary') {
      await setSecretaryDepartments(c.env.DB, result.lastInsertRowid, department_ids);
    }
    const user = await dbGet(c.env.DB, USER_SELECT + ' WHERE u.id = ?', result.lastInsertRowid);
    const [withDepts] = await withSecretaryDepartments(c.env.DB, [user]);
    return c.json(withDepts, 201);
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

  const { full_name, role, department_id, department_ids, password } = await c.req.json().catch(() => ({}));
  const normalizedRole = VALID_ROLES.includes(role) ? role : existing.role;

  if (normalizedRole === 'secretary') {
    if (!Array.isArray(department_ids) || department_ids.length === 0) {
      return c.json({ error: 'A Secretary account must be assigned at least one department' }, 400);
    }
  } else if (normalizedRole !== 'admin' && !(department_id ?? existing.department_id)) {
    return c.json({ error: 'Staff and Subject Coordinator accounts must be assigned a department' }, 400);
  }
  if (currentUser.id === Number(id) && normalizedRole !== 'admin') {
    return c.json({ error: 'You cannot demote your own admin account' }, 400);
  }

  const newDepartmentId =
    normalizedRole === 'staff' || normalizedRole === 'subject_coordinator'
      ? department_id ?? existing.department_id
      : null;

  await dbRun(
    c.env.DB,
    'UPDATE users SET full_name = ?, role = ?, department_id = ? WHERE id = ?',
    full_name?.trim() || existing.full_name,
    normalizedRole,
    newDepartmentId,
    id
  );

  if (normalizedRole === 'secretary') {
    await setSecretaryDepartments(c.env.DB, id, department_ids);
  } else if (existing.role === 'secretary') {
    // No longer a secretary -- drop her old department coverage.
    await dbRun(c.env.DB, 'DELETE FROM secretary_departments WHERE user_id = ?', id);
  }

  if (password) {
    const passwordHash = bcrypt.hashSync(password, 10);
    await dbRun(c.env.DB, 'UPDATE users SET password_hash = ? WHERE id = ?', passwordHash, id);
  }

  const user = await dbGet(c.env.DB, USER_SELECT + ' WHERE u.id = ?', id);
  const [withDepts] = await withSecretaryDepartments(c.env.DB, [user]);
  return c.json(withDepts);
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

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', (req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.full_name, u.username, u.role, u.department_id, u.created_at, d.name AS department_name
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
       ORDER BY u.role DESC, u.full_name`
    )
    .all();
  res.json(users);
});

router.post('/', (req, res) => {
  const { full_name, username, password, role, department_id } = req.body || {};
  if (!full_name?.trim() || !username?.trim() || !password) {
    return res.status(400).json({ error: 'full_name, username and password are required' });
  }
  const normalizedRole = role === 'admin' ? 'admin' : 'staff';
  if (normalizedRole === 'staff' && !department_id) {
    return res.status(400).json({ error: 'Staff accounts must be assigned a department' });
  }
  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare(
        `INSERT INTO users (full_name, username, password_hash, role, department_id) VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        full_name.trim(),
        username.trim(),
        passwordHash,
        normalizedRole,
        normalizedRole === 'staff' ? department_id : null
      );
    const user = db
      .prepare(
        `SELECT u.id, u.full_name, u.username, u.role, u.department_id, u.created_at, d.name AS department_name
         FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`
      )
      .get(result.lastInsertRowid);
    res.status(201).json(user);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'That username is already taken' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const { full_name, role, department_id, password } = req.body || {};
  const normalizedRole = role === 'admin' ? 'admin' : role === 'staff' ? 'staff' : existing.role;
  const newDepartmentId =
    normalizedRole === 'staff' ? department_id ?? existing.department_id : null;

  if (normalizedRole === 'staff' && !newDepartmentId) {
    return res.status(400).json({ error: 'Staff accounts must be assigned a department' });
  }
  if (req.user.id === Number(req.params.id) && normalizedRole !== 'admin') {
    return res.status(400).json({ error: 'You cannot demote your own admin account' });
  }

  db.prepare('UPDATE users SET full_name = ?, role = ?, department_id = ? WHERE id = ?').run(
    full_name?.trim() || existing.full_name,
    normalizedRole,
    newDepartmentId,
    req.params.id
  );

  if (password) {
    const passwordHash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, req.params.id);
  }

  const user = db
    .prepare(
      `SELECT u.id, u.full_name, u.username, u.role, u.department_id, u.created_at, d.name AS department_name
       FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`
    )
    .get(req.params.id);
  res.json(user);
});

router.delete('/:id', (req, res) => {
  if (req.user.id === Number(req.params.id)) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;

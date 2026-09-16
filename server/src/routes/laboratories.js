import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

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

router.get('/', (req, res) => {
  const { department_id, status } = req.query;
  const clauses = [];
  const params = [];

  if (req.user.role !== 'admin') {
    // Staff only ever see their own department: approved labs, plus their own pending/rejected requests.
    clauses.push('l.department_id = ?');
    params.push(req.user.department_id);
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

  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const lab = db.prepare(LAB_SELECT + ' WHERE l.id = ?').get(req.params.id);
  if (!lab) return res.status(404).json({ error: 'Laboratory not found' });
  if (!assertDepartmentAccess(req.user, lab.department_id)) {
    return res.status(403).json({ error: 'You do not have access to this laboratory' });
  }
  res.json(lab);
});

// Staff enroll a laboratory for their own department (goes to 'pending').
// Admins create a laboratory directly (auto-'approved').
router.post('/', (req, res) => {
  const { name, location } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  let departmentId = req.user.department_id;
  if (req.user.role === 'admin') {
    departmentId = req.body.department_id;
    if (!departmentId) return res.status(400).json({ error: 'department_id is required' });
  } else if (!departmentId) {
    return res.status(400).json({ error: 'Your account is not assigned to a department' });
  }

  const isAdmin = req.user.role === 'admin';
  try {
    const result = db
      .prepare(
        `INSERT INTO laboratories (name, department_id, location, status, requested_by, reviewed_by, reviewed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name.trim(),
        departmentId,
        location?.trim() || null,
        isAdmin ? 'approved' : 'pending',
        req.user.id,
        isAdmin ? req.user.id : null,
        isAdmin ? new Date().toISOString() : null
      );
    res.status(201).json(db.prepare(LAB_SELECT + ' WHERE l.id = ?').get(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A laboratory with that name already exists in this department' });
    }
    res.status(500).json({ error: 'Failed to create laboratory' });
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM laboratories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Laboratory not found' });
  if (!assertDepartmentAccess(req.user, existing.department_id)) {
    return res.status(403).json({ error: 'You do not have access to this laboratory' });
  }
  const { name, location } = req.body || {};
  db.prepare('UPDATE laboratories SET name = ?, location = ? WHERE id = ?').run(
    name?.trim() || existing.name,
    location?.trim() ?? existing.location,
    req.params.id
  );
  res.json(db.prepare(LAB_SELECT + ' WHERE l.id = ?').get(req.params.id));
});

router.post('/:id/approve', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM laboratories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Laboratory not found' });
  db.prepare(
    `UPDATE laboratories SET status = 'approved', reviewed_by = ?, reviewed_at = ?, rejection_reason = NULL WHERE id = ?`
  ).run(req.user.id, new Date().toISOString(), req.params.id);
  res.json(db.prepare(LAB_SELECT + ' WHERE l.id = ?').get(req.params.id));
});

router.post('/:id/reject', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM laboratories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Laboratory not found' });
  const { reason } = req.body || {};
  db.prepare(
    `UPDATE laboratories SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, rejection_reason = ? WHERE id = ?`
  ).run(req.user.id, new Date().toISOString(), reason?.trim() || null, req.params.id);
  res.json(db.prepare(LAB_SELECT + ' WHERE l.id = ?').get(req.params.id));
});

router.delete('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM laboratories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Laboratory not found' });
  db.prepare('DELETE FROM laboratories WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;

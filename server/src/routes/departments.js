import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const departments = db
    .prepare(
      `SELECT d.*,
        (SELECT COUNT(*) FROM laboratories l WHERE l.department_id = d.id AND l.status = 'approved') AS laboratory_count,
        (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id) AS staff_count
       FROM departments d ORDER BY d.name`
    )
    .all();
  res.json(departments);
});

router.post('/', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const result = db.prepare('INSERT INTO departments (name) VALUES (?)').run(name.trim());
    res.status(201).json(db.prepare('SELECT * FROM departments WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A department with that name already exists' });
    }
    res.status(500).json({ error: 'Failed to create department' });
  }
});

router.put('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Department not found' });
  const { name } = req.body || {};
  db.prepare('UPDATE departments SET name = ? WHERE id = ?').run(name?.trim() || existing.name, req.params.id);
  res.json(db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Department not found' });
  db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;

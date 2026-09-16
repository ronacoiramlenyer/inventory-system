import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const labs = db
    .prepare(
      `SELECT l.*,
        (SELECT COUNT(*) FROM items i WHERE i.laboratory_id = l.id) AS item_count
       FROM laboratories l
       ORDER BY l.name`
    )
    .all();
  res.json(labs);
});

router.get('/:id', (req, res) => {
  const lab = db.prepare('SELECT * FROM laboratories WHERE id = ?').get(req.params.id);
  if (!lab) return res.status(404).json({ error: 'Laboratory not found' });
  res.json(lab);
});

router.post('/', (req, res) => {
  const { name, department, location } = req.body || {};
  if (!name || !department) {
    return res.status(400).json({ error: 'name and department are required' });
  }
  try {
    const result = db
      .prepare('INSERT INTO laboratories (name, department, location) VALUES (?, ?, ?)')
      .run(name.trim(), department.trim(), location?.trim() || null);
    const lab = db.prepare('SELECT * FROM laboratories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(lab);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A laboratory with that name already exists' });
    }
    res.status(500).json({ error: 'Failed to create laboratory' });
  }
});

router.put('/:id', (req, res) => {
  const { name, department, location } = req.body || {};
  const existing = db.prepare('SELECT * FROM laboratories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Laboratory not found' });
  db.prepare('UPDATE laboratories SET name = ?, department = ?, location = ? WHERE id = ?').run(
    name?.trim() || existing.name,
    department?.trim() || existing.department,
    location?.trim() ?? existing.location,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM laboratories WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM laboratories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Laboratory not found' });
  db.prepare('DELETE FROM laboratories WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;

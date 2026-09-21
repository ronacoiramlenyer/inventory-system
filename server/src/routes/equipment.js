import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const EQUIPMENT_SELECT = `
  SELECT e.id, e.laboratory_id, e.item_name, e.serial_number, e.location, e.created_at,
    l.name AS laboratory_name, l.department_id, l.status AS lab_status, d.name AS department_name
  FROM items e
  JOIN laboratories l ON l.id = e.laboratory_id
  JOIN departments d ON d.id = l.department_id
  WHERE e.category = 'Equipment'
`;

function userCanAccessEquipment(user, item) {
  if (!item) return false;
  if (user.role === 'admin') return true;
  return Number(item.department_id) === Number(user.department_id) && item.lab_status === 'approved';
}

router.get('/:id/logs', (req, res) => {
  const item = db.prepare(EQUIPMENT_SELECT + ' AND e.id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Equipment not found' });
  if (!userCanAccessEquipment(req.user, item)) {
    return res.status(403).json({ error: 'You do not have access to this equipment' });
  }
  const logs = db.prepare('SELECT * FROM equipment_logs WHERE equipment_id = ? ORDER BY entry_date ASC, id ASC').all(item.id);
  res.json(logs);
});

router.post('/:id/logs', (req, res) => {
  const item = db.prepare(EQUIPMENT_SELECT + ' AND e.id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Equipment not found' });
  if (!userCanAccessEquipment(req.user, item)) {
    return res.status(403).json({ error: 'You do not have access to this equipment' });
  }

  const { entry_date, service_performed, request_id, status, logged_by } = req.body || {};
  if (!entry_date || !service_performed?.trim()) {
    return res.status(400).json({ error: 'entry_date and service_performed are required' });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO equipment_logs (equipment_id, entry_date, service_performed, request_id, status, logged_by, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        item.id,
        entry_date,
        service_performed.trim(),
        request_id?.trim() || null,
        status?.trim() || null,
        logged_by?.trim() || req.user.full_name,
        req.user.id
      );
    res.status(201).json(db.prepare('SELECT * FROM equipment_logs WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: 'Failed to save entry' });
  }
});

router.delete('/:id/logs/:logId', (req, res) => {
  const item = db.prepare(EQUIPMENT_SELECT + ' AND e.id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Equipment not found' });
  if (!userCanAccessEquipment(req.user, item)) {
    return res.status(403).json({ error: 'You do not have access to this equipment' });
  }
  const log = db
    .prepare('SELECT * FROM equipment_logs WHERE id = ? AND equipment_id = ?')
    .get(req.params.logId, item.id);
  if (!log) return res.status(404).json({ error: 'Log entry not found' });
  db.prepare('DELETE FROM equipment_logs WHERE id = ?').run(log.id);
  res.status(204).end();
});

export default router;

import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const INSTANCE_SELECT = `
  SELECT ei.id, ei.item_id, ei.serial_number, ei.location, ei.status, ei.created_at,
    i.item_name, i.laboratory_id, i.category,
    l.name AS laboratory_name, l.department_id, d.name AS department_name
  FROM equipment_instances ei
  JOIN items i ON i.id = ei.item_id
  JOIN laboratories l ON l.id = i.laboratory_id
  JOIN departments d ON d.id = l.department_id
`;

function userCanAccessInstance(user, instance) {
  if (!instance) return false;
  if (user.role === 'admin') return true;
  return Number(instance.department_id) === Number(user.department_id);
}

// Special routes (must come before /:id routes)
// POST /api/equipment-instances/bulk - Create multiple instances
router.post('/bulk', (req, res) => {
  const { item_id, instances } = req.body || {};
  if (!item_id || !Array.isArray(instances) || instances.length === 0) {
    return res.status(400).json({ error: 'item_id and instances array are required' });
  }

  const item = db.prepare('SELECT i.*, l.department_id FROM items i JOIN laboratories l ON l.id = i.laboratory_id WHERE i.id = ?').get(item_id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (!userCanAccessInstance(req.user, item)) {
    return res.status(403).json({ error: 'You do not have access to this item' });
  }

  try {
    const created = [];
    const insertStmt = db.prepare('INSERT INTO equipment_instances (item_id, serial_number, location, status) VALUES (?, ?, ?, ?)');

    for (const inst of instances) {
      if (!inst.serial_number) continue;
      const result = insertStmt.run(
        item_id,
        inst.serial_number.trim(),
        inst.location?.trim() || null,
        inst.status?.trim() || null
      );
      created.push(db.prepare(INSTANCE_SELECT + ' WHERE ei.id = ?').get(result.lastInsertRowid));
    }

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create instances', details: err.message });
  }
});

// GET /api/equipment-instances/item/:itemId - List all instances for an item
router.get('/item/:itemId', (req, res) => {
  const item = db.prepare('SELECT i.*, l.department_id FROM items i JOIN laboratories l ON l.id = i.laboratory_id WHERE i.id = ?').get(req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (!userCanAccessInstance(req.user, item)) {
    return res.status(403).json({ error: 'You do not have access to this item' });
  }
  const instances = db.prepare(INSTANCE_SELECT + ' WHERE ei.item_id = ? ORDER BY ei.serial_number').all(req.params.itemId);
  res.json(instances);
});

// Standard CRUD routes

// POST /api/equipment-instances - Create new instance
router.post('/', (req, res) => {
  const { item_id, serial_number, location, status } = req.body || {};
  if (!item_id || !serial_number) {
    return res.status(400).json({ error: 'item_id and serial_number are required' });
  }

  const item = db.prepare('SELECT i.*, l.department_id FROM items i JOIN laboratories l ON l.id = i.laboratory_id WHERE i.id = ?').get(item_id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (!userCanAccessInstance(req.user, item)) {
    return res.status(403).json({ error: 'You do not have access to this item' });
  }

  try {
    const result = db.prepare(
      'INSERT INTO equipment_instances (item_id, serial_number, location, status) VALUES (?, ?, ?, ?)'
    ).run(item_id, serial_number.trim(), location?.trim() || null, status?.trim() || null);

    res.status(201).json(db.prepare(INSTANCE_SELECT + ' WHERE ei.id = ?').get(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'An instance with this serial number already exists for this item' });
    }
    res.status(500).json({ error: 'Failed to create instance' });
  }
});

// GET /api/equipment-instances/:id - Get single instance
router.get('/:id', (req, res) => {
  const instance = db.prepare(INSTANCE_SELECT + ' WHERE ei.id = ?').get(req.params.id);
  if (!instance) return res.status(404).json({ error: 'Equipment instance not found' });
  if (!userCanAccessInstance(req.user, instance)) {
    return res.status(403).json({ error: 'You do not have access to this instance' });
  }
  res.json(instance);
});

// PUT /api/equipment-instances/:id - Update instance
router.put('/:id', (req, res) => {
  const instance = db.prepare(INSTANCE_SELECT + ' WHERE ei.id = ?').get(req.params.id);
  if (!instance) return res.status(404).json({ error: 'Equipment instance not found' });
  if (!userCanAccessInstance(req.user, instance)) {
    return res.status(403).json({ error: 'You do not have access to this instance' });
  }

  const { serial_number, location, status } = req.body || {};
  db.prepare('UPDATE equipment_instances SET serial_number = ?, location = ?, status = ? WHERE id = ?').run(
    serial_number?.trim() || instance.serial_number,
    location?.trim() ?? instance.location,
    status?.trim() ?? instance.status,
    req.params.id
  );

  res.json(db.prepare(INSTANCE_SELECT + ' WHERE ei.id = ?').get(req.params.id));
});

// DELETE /api/equipment-instances/:id - Delete instance
router.delete('/:id', (req, res) => {
  const instance = db.prepare(INSTANCE_SELECT + ' WHERE ei.id = ?').get(req.params.id);
  if (!instance) return res.status(404).json({ error: 'Equipment instance not found' });
  if (!userCanAccessInstance(req.user, instance)) {
    return res.status(403).json({ error: 'You do not have access to this instance' });
  }

  db.prepare('DELETE FROM equipment_instances WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// Logs endpoints

// GET /api/equipment-instances/:id/logs - Get logs for instance
router.get('/:id/logs', (req, res) => {
  const instance = db.prepare(INSTANCE_SELECT + ' WHERE ei.id = ?').get(req.params.id);
  if (!instance) return res.status(404).json({ error: 'Equipment instance not found' });
  if (!userCanAccessInstance(req.user, instance)) {
    return res.status(403).json({ error: 'You do not have access to this instance' });
  }

  const logs = db.prepare('SELECT * FROM equipment_logs WHERE equipment_instance_id = ? ORDER BY entry_date ASC, id ASC').all(req.params.id);
  res.json(logs);
});

// POST /api/equipment-instances/:id/logs - Create log entry
router.post('/:id/logs', (req, res) => {
  const instance = db.prepare(INSTANCE_SELECT + ' WHERE ei.id = ?').get(req.params.id);
  if (!instance) return res.status(404).json({ error: 'Equipment instance not found' });
  if (!userCanAccessInstance(req.user, instance)) {
    return res.status(403).json({ error: 'You do not have access to this instance' });
  }

  const { entry_date, service_performed, request_id, status, logged_by } = req.body || {};
  if (!entry_date || !service_performed?.trim()) {
    return res.status(400).json({ error: 'entry_date and service_performed are required' });
  }

  try {
    const result = db.prepare(
      `INSERT INTO equipment_logs (equipment_instance_id, entry_date, service_performed, request_id, status, logged_by, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.params.id,
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

// DELETE /api/equipment-instances/:id/logs/:logId - Delete log entry
router.delete('/:id/logs/:logId', (req, res) => {
  const instance = db.prepare(INSTANCE_SELECT + ' WHERE ei.id = ?').get(req.params.id);
  if (!instance) return res.status(404).json({ error: 'Equipment instance not found' });
  if (!userCanAccessInstance(req.user, instance)) {
    return res.status(403).json({ error: 'You do not have access to this instance' });
  }

  const log = db.prepare('SELECT * FROM equipment_logs WHERE id = ? AND equipment_instance_id = ?').get(req.params.logId, req.params.id);
  if (!log) return res.status(404).json({ error: 'Log entry not found' });

  db.prepare('DELETE FROM equipment_logs WHERE id = ?').run(log.id);
  res.status(204).end();
});

export default router;

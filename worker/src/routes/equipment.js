import { Hono } from 'hono';
import { dbAll, dbGet, dbRun, clearEquipmentLinks } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

// F-LAB-001 Equipment Monitoring Record: equipment is just an `items` row
// with category = 'Equipment' -- this router is a thin view over items
// scoped to that category, so equipment shows up in the regular Inventory
// list too instead of living in its own separate registry.
const equipment = new Hono();
equipment.use('*', requireAuth);

const EQUIPMENT_SELECT = `
  SELECT e.id, e.laboratory_id, e.item_name AS name_description, e.serial_number, e.location, e.created_at,
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

equipment.get('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id } = c.req.query();
  const clauses = [];
  const params = [];

  if (user.role !== 'admin') {
    clauses.push('l.department_id = ?', "l.status = 'approved'");
    params.push(user.department_id);
  }
  if (laboratory_id) {
    clauses.push('e.laboratory_id = ?');
    params.push(laboratory_id);
  }

  let sql = EQUIPMENT_SELECT;
  if (clauses.length) sql += ' AND ' + clauses.join(' AND ');
  sql += ' ORDER BY e.item_name';

  return c.json(await dbAll(c.env.DB, sql, ...params));
});

equipment.get('/:id', async (c) => {
  const user = c.get('user');
  const item = await dbGet(c.env.DB, EQUIPMENT_SELECT + ' AND e.id = ?', c.req.param('id'));
  if (!item) return c.json({ error: 'Equipment not found' }, 404);
  if (!userCanAccessEquipment(user, item)) {
    return c.json({ error: 'You do not have access to this equipment' }, 403);
  }
  return c.json(item);
});

// No POST route here -- new equipment is only created through the
// Inventory Sheet's "add row" flow (category = Equipment), same as any
// other item; see inventory-counts.js.

equipment.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, EQUIPMENT_SELECT + ' AND e.id = ?', id);
  if (!existing) return c.json({ error: 'Equipment not found' }, 404);
  if (!userCanAccessEquipment(user, existing)) {
    return c.json({ error: 'You do not have access to this equipment' }, 403);
  }

  const { name_description, serial_number, location } = await c.req.json().catch(() => ({}));
  await dbRun(
    c.env.DB,
    `UPDATE items SET item_name = ?, serial_number = ?, location = ? WHERE id = ?`,
    name_description?.trim() || existing.name_description,
    serial_number?.trim() ?? existing.serial_number,
    location?.trim() ?? existing.location,
    id
  );
  return c.json(await dbGet(c.env.DB, EQUIPMENT_SELECT + ' AND e.id = ?', id));
});

equipment.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, EQUIPMENT_SELECT + ' AND e.id = ?', id);
  if (!existing) return c.json({ error: 'Equipment not found' }, 404);
  if (!userCanAccessEquipment(user, existing)) {
    return c.json({ error: 'You do not have access to this equipment' }, 403);
  }
  await clearEquipmentLinks(c.env.DB, id);
  await dbRun(c.env.DB, 'DELETE FROM items WHERE id = ?', id);
  return c.body(null, 204);
});

equipment.get('/:id/logs', async (c) => {
  const user = c.get('user');
  const item = await dbGet(c.env.DB, EQUIPMENT_SELECT + ' AND e.id = ?', c.req.param('id'));
  if (!item) return c.json({ error: 'Equipment not found' }, 404);
  if (!userCanAccessEquipment(user, item)) {
    return c.json({ error: 'You do not have access to this equipment' }, 403);
  }
  const logs = await dbAll(
    c.env.DB,
    'SELECT * FROM equipment_logs WHERE equipment_id = ? ORDER BY entry_date ASC, id ASC',
    item.id
  );
  return c.json(logs);
});

equipment.post('/:id/logs', async (c) => {
  const user = c.get('user');
  const item = await dbGet(c.env.DB, EQUIPMENT_SELECT + ' AND e.id = ?', c.req.param('id'));
  if (!item) return c.json({ error: 'Equipment not found' }, 404);
  if (!userCanAccessEquipment(user, item)) {
    return c.json({ error: 'You do not have access to this equipment' }, 403);
  }

  const { entry_date, service_performed, request_id, status, logged_by } = await c.req.json().catch(() => ({}));
  if (!entry_date || !service_performed?.trim()) {
    return c.json({ error: 'entry_date and service_performed are required' }, 400);
  }

  const result = await dbRun(
    c.env.DB,
    `INSERT INTO equipment_logs (equipment_id, entry_date, service_performed, request_id, status, logged_by, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    item.id,
    entry_date,
    service_performed.trim(),
    request_id?.trim() || null,
    status?.trim() || null,
    logged_by?.trim() || user.full_name,
    user.id
  );
  return c.json(await dbGet(c.env.DB, 'SELECT * FROM equipment_logs WHERE id = ?', result.lastInsertRowid), 201);
});

equipment.delete('/:id/logs/:logId', async (c) => {
  const user = c.get('user');
  const item = await dbGet(c.env.DB, EQUIPMENT_SELECT + ' AND e.id = ?', c.req.param('id'));
  if (!item) return c.json({ error: 'Equipment not found' }, 404);
  if (!userCanAccessEquipment(user, item)) {
    return c.json({ error: 'You do not have access to this equipment' }, 403);
  }
  const log = await dbGet(
    c.env.DB,
    'SELECT * FROM equipment_logs WHERE id = ? AND equipment_id = ?',
    c.req.param('logId'),
    item.id
  );
  if (!log) return c.json({ error: 'Log entry not found' }, 404);
  await dbRun(c.env.DB, 'DELETE FROM equipment_logs WHERE id = ?', log.id);
  return c.body(null, 204);
});

export default equipment;

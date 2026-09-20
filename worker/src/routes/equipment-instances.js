import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

// An `items` row with category = 'Equipment' is a *type* of equipment held
// in some quantity ("3D Printer", qty 2). Each physical unit of it is a row
// here, carrying the serial number/location that identifies that one unit,
// so F-LAB-001 can keep a separate service history per unit instead of one
// shared log for the whole line item.
const equipmentInstances = new Hono();
equipmentInstances.use('*', requireAuth);

const INSTANCE_SELECT = `
  SELECT ei.id, ei.item_id, ei.serial_number, ei.location, ei.status, ei.created_at,
    i.item_name, i.laboratory_id, i.category,
    l.name AS laboratory_name, l.department_id, l.status AS lab_status,
    d.name AS department_name
  FROM equipment_instances ei
  JOIN items i ON i.id = ei.item_id
  JOIN laboratories l ON l.id = i.laboratory_id
  JOIN departments d ON d.id = l.department_id
`;

const ITEM_SELECT = `
  SELECT i.id, i.item_name, i.category, i.laboratory_id,
    l.department_id, l.status AS lab_status
  FROM items i
  JOIN laboratories l ON l.id = i.laboratory_id
`;

function userCanAccess(user, row) {
  if (!row) return false;
  if (user.role === 'admin') return true;
  return Number(row.department_id) === Number(user.department_id) && row.lab_status === 'approved';
}

// Literal and multi-segment paths are registered before the bare `/:id`
// routes so "bulk" and "item" can't be swallowed as an id.

equipmentInstances.post('/bulk', async (c) => {
  const user = c.get('user');
  const { item_id, instances } = await c.req.json().catch(() => ({}));
  if (!item_id || !Array.isArray(instances) || instances.length === 0) {
    return c.json({ error: 'item_id and instances array are required' }, 400);
  }

  const item = await dbGet(c.env.DB, ITEM_SELECT + ' WHERE i.id = ?', item_id);
  if (!item) return c.json({ error: 'Item not found' }, 404);
  if (!userCanAccess(user, item)) {
    return c.json({ error: 'You do not have access to this item' }, 403);
  }

  const created = [];
  for (const inst of instances) {
    if (!inst?.serial_number?.trim()) continue;
    try {
      const result = await dbRun(
        c.env.DB,
        'INSERT INTO equipment_instances (item_id, serial_number, location, status) VALUES (?, ?, ?, ?)',
        item_id,
        inst.serial_number.trim(),
        inst.location?.trim() || null,
        inst.status?.trim() || null
      );
      created.push(await dbGet(c.env.DB, INSTANCE_SELECT + ' WHERE ei.id = ?', result.lastInsertRowid));
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return c.json(
          { error: `Serial number "${inst.serial_number.trim()}" already exists for this item`, created },
          409
        );
      }
      throw err;
    }
  }

  return c.json(created, 201);
});

equipmentInstances.get('/item/:itemId', async (c) => {
  const user = c.get('user');
  const item = await dbGet(c.env.DB, ITEM_SELECT + ' WHERE i.id = ?', c.req.param('itemId'));
  if (!item) return c.json({ error: 'Item not found' }, 404);
  if (!userCanAccess(user, item)) {
    return c.json({ error: 'You do not have access to this item' }, 403);
  }
  return c.json(
    await dbAll(c.env.DB, INSTANCE_SELECT + ' WHERE ei.item_id = ? ORDER BY ei.serial_number', c.req.param('itemId'))
  );
});

// Claims the item-level logs written before this item was split into units
// (or auto-logged against the item by a schedule/work request) for one
// specific unit, so they show up in that unit's F-LAB-001 history.
equipmentInstances.post('/:instanceId/adopt-logs/:itemId', async (c) => {
  const user = c.get('user');
  const instanceId = c.req.param('instanceId');
  const itemId = c.req.param('itemId');

  const instance = await dbGet(c.env.DB, INSTANCE_SELECT + ' WHERE ei.id = ?', instanceId);
  if (!instance) return c.json({ error: 'Equipment instance not found' }, 404);
  if (!userCanAccess(user, instance)) {
    return c.json({ error: 'You do not have access to this instance' }, 403);
  }
  if (Number(instance.item_id) !== Number(itemId)) {
    return c.json({ error: 'That instance does not belong to this item' }, 400);
  }

  const result = await dbRun(
    c.env.DB,
    'UPDATE equipment_logs SET equipment_instance_id = ? WHERE equipment_id = ? AND equipment_instance_id IS NULL',
    instanceId,
    itemId
  );
  return c.json({ logs_updated: result.changes });
});

equipmentInstances.get('/:id/logs', async (c) => {
  const user = c.get('user');
  const instance = await dbGet(c.env.DB, INSTANCE_SELECT + ' WHERE ei.id = ?', c.req.param('id'));
  if (!instance) return c.json({ error: 'Equipment instance not found' }, 404);
  if (!userCanAccess(user, instance)) {
    return c.json({ error: 'You do not have access to this instance' }, 403);
  }
  return c.json(
    await dbAll(
      c.env.DB,
      'SELECT * FROM equipment_logs WHERE equipment_instance_id = ? ORDER BY entry_date ASC, id ASC',
      instance.id
    )
  );
});

equipmentInstances.post('/:id/logs', async (c) => {
  const user = c.get('user');
  const instance = await dbGet(c.env.DB, INSTANCE_SELECT + ' WHERE ei.id = ?', c.req.param('id'));
  if (!instance) return c.json({ error: 'Equipment instance not found' }, 404);
  if (!userCanAccess(user, instance)) {
    return c.json({ error: 'You do not have access to this instance' }, 403);
  }

  const { entry_date, service_performed, request_id, status, logged_by } = await c.req.json().catch(() => ({}));
  if (!entry_date || !service_performed?.trim()) {
    return c.json({ error: 'entry_date and service_performed are required' }, 400);
  }

  // equipment_id stays populated alongside the instance link: it's NOT NULL,
  // and keeping it means the item-level views (and anything still reading
  // logs by item) see these entries too.
  const result = await dbRun(
    c.env.DB,
    `INSERT INTO equipment_logs (equipment_id, equipment_instance_id, entry_date, service_performed, request_id, status, logged_by, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    instance.item_id,
    instance.id,
    entry_date,
    service_performed.trim(),
    request_id?.trim() || null,
    status?.trim() || null,
    logged_by?.trim() || user.full_name,
    user.id
  );
  return c.json(await dbGet(c.env.DB, 'SELECT * FROM equipment_logs WHERE id = ?', result.lastInsertRowid), 201);
});

equipmentInstances.delete('/:id/logs/:logId', async (c) => {
  const user = c.get('user');
  const instance = await dbGet(c.env.DB, INSTANCE_SELECT + ' WHERE ei.id = ?', c.req.param('id'));
  if (!instance) return c.json({ error: 'Equipment instance not found' }, 404);
  if (!userCanAccess(user, instance)) {
    return c.json({ error: 'You do not have access to this instance' }, 403);
  }
  const log = await dbGet(
    c.env.DB,
    'SELECT * FROM equipment_logs WHERE id = ? AND equipment_instance_id = ?',
    c.req.param('logId'),
    instance.id
  );
  if (!log) return c.json({ error: 'Log entry not found' }, 404);
  await dbRun(c.env.DB, 'DELETE FROM equipment_logs WHERE id = ?', log.id);
  return c.body(null, 204);
});

equipmentInstances.get('/:id', async (c) => {
  const user = c.get('user');
  const instance = await dbGet(c.env.DB, INSTANCE_SELECT + ' WHERE ei.id = ?', c.req.param('id'));
  if (!instance) return c.json({ error: 'Equipment instance not found' }, 404);
  if (!userCanAccess(user, instance)) {
    return c.json({ error: 'You do not have access to this instance' }, 403);
  }
  return c.json(instance);
});

equipmentInstances.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const instance = await dbGet(c.env.DB, INSTANCE_SELECT + ' WHERE ei.id = ?', id);
  if (!instance) return c.json({ error: 'Equipment instance not found' }, 404);
  if (!userCanAccess(user, instance)) {
    return c.json({ error: 'You do not have access to this instance' }, 403);
  }

  const { serial_number, location, status } = await c.req.json().catch(() => ({}));
  try {
    await dbRun(
      c.env.DB,
      'UPDATE equipment_instances SET serial_number = ?, location = ?, status = ? WHERE id = ?',
      serial_number?.trim() || instance.serial_number,
      location?.trim() ?? instance.location,
      status?.trim() ?? instance.status,
      id
    );
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return c.json({ error: 'Another unit of this item already has that serial number' }, 409);
    }
    throw err;
  }
  return c.json(await dbGet(c.env.DB, INSTANCE_SELECT + ' WHERE ei.id = ?', id));
});

equipmentInstances.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const instance = await dbGet(c.env.DB, INSTANCE_SELECT + ' WHERE ei.id = ?', id);
  if (!instance) return c.json({ error: 'Equipment instance not found' }, 404);
  if (!userCanAccess(user, instance)) {
    return c.json({ error: 'You do not have access to this instance' }, 403);
  }
  // The unit goes away; its service history stays on the item.
  await dbRun(c.env.DB, 'UPDATE equipment_logs SET equipment_instance_id = NULL WHERE equipment_instance_id = ?', id);
  await dbRun(c.env.DB, 'DELETE FROM equipment_instances WHERE id = ?', id);
  return c.body(null, 204);
});

export default equipmentInstances;

import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

const equipmentRecords = new Hono();
equipmentRecords.use('*', requireAuth);

function labAccessibleToUser(user, lab) {
  if (!lab) return false;
  if (user.role === 'admin') return true;
  return Number(lab.department_id) === Number(user.department_id) && lab.status === 'approved';
}

// Get all equipment records for a lab (includes item name via join)
equipmentRecords.get('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id } = c.req.query();

  if (!laboratory_id) {
    return c.json({ error: 'laboratory_id is required' }, 400);
  }

  const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
  if (!labAccessibleToUser(user, lab)) {
    return c.json({ error: 'You do not have access to this laboratory' }, 403);
  }

  const rows = await dbAll(
    c.env.DB,
    `SELECT er.id, er.laboratory_id, er.item_id, er.serial_number, er.location, er.created_at,
            i.item_name, i.category
     FROM equipment_records er
     JOIN items i ON i.id = er.item_id
     WHERE er.laboratory_id = ?
     ORDER BY i.item_name, er.serial_number`,
    laboratory_id
  );
  return c.json(rows);
});

// Get a single equipment record
equipmentRecords.get('/:id', async (c) => {
  const user = c.get('user');
  const row = await dbGet(
    c.env.DB,
    `SELECT er.*, i.item_name, i.category
     FROM equipment_records er
     JOIN items i ON i.id = er.item_id
     WHERE er.id = ?`,
    c.req.param('id')
  );

  if (!row) return c.json({ error: 'Equipment record not found' }, 404);

  const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', row.laboratory_id);
  if (!labAccessibleToUser(user, lab)) {
    return c.json({ error: 'You do not have access to this equipment record' }, 403);
  }

  return c.json(row);
});

// Create equipment records for an inventory item (staff can define multiple serial numbers)
equipmentRecords.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'staff' && user.role !== 'admin') {
    return c.json({ error: 'Only staff/admin can create equipment records' }, 403);
  }

  const { laboratory_id, item_id, serial_numbers } = await c.req.json().catch(() => ({}));

  if (!laboratory_id || !item_id || !Array.isArray(serial_numbers) || serial_numbers.length === 0) {
    return c.json({
      error: 'laboratory_id, item_id, and serial_numbers array are required',
    }, 400);
  }

  const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
  if (!labAccessibleToUser(user, lab)) {
    return c.json({ error: 'You do not have access to this laboratory' }, 403);
  }

  const item = await dbGet(c.env.DB, 'SELECT * FROM items WHERE id = ? AND laboratory_id = ?', item_id, laboratory_id);
  if (!item) {
    return c.json({ error: 'Item not found in this laboratory' }, 404);
  }

  if (item.category !== 'Equipment') {
    return c.json({ error: 'Only Equipment category items can have equipment records' }, 400);
  }

  const created = [];
  for (const sn of serial_numbers) {
    const trimmed = sn.trim();
    if (!trimmed) continue;

    try {
      const result = await dbRun(
        c.env.DB,
        `INSERT INTO equipment_records (laboratory_id, item_id, serial_number)
         VALUES (?, ?, ?)`,
        laboratory_id,
        item_id,
        trimmed
      );
      const record = await dbGet(c.env.DB, `SELECT * FROM equipment_records WHERE id = ?`, result.lastInsertRowid);
      created.push(record);
    } catch (err) {
      if (!err.message.includes('UNIQUE constraint failed')) throw err;
      // Serial number already exists for this item in this lab, skip
    }
  }

  return c.json(created, 201);
});

// Update equipment record (serial number, location)
equipmentRecords.put('/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'staff' && user.role !== 'admin') {
    return c.json({ error: 'Only staff/admin can update equipment records' }, 403);
  }

  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, 'SELECT * FROM equipment_records WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Equipment record not found' }, 404);

  const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', existing.laboratory_id);
  if (!labAccessibleToUser(user, lab)) {
    return c.json({ error: 'You do not have access to this equipment record' }, 403);
  }

  const { serial_number, location } = await c.req.json().catch(() => ({}));

  await dbRun(
    c.env.DB,
    `UPDATE equipment_records SET serial_number = ?, location = ? WHERE id = ?`,
    serial_number?.trim() || existing.serial_number,
    location?.trim() ?? existing.location,
    id
  );

  return c.json(await dbGet(
    c.env.DB,
    `SELECT er.*, i.item_name, i.category FROM equipment_records er JOIN items i ON i.id = er.item_id WHERE er.id = ?`,
    id
  ));
});

// Delete equipment record (only if no service history)
equipmentRecords.delete('/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Only admin can delete equipment records' }, 403);
  }

  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, 'SELECT * FROM equipment_records WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Equipment record not found' }, 404);

  // Check if there are any logs for this equipment
  const logs = await dbGet(c.env.DB, 'SELECT COUNT(*) as count FROM equipment_logs WHERE equipment_record_id = ?', id);
  if (logs.count > 0) {
    return c.json({ error: 'Cannot delete equipment record with service history' }, 400);
  }

  await dbRun(c.env.DB, 'DELETE FROM equipment_records WHERE id = ?', id);
  return c.body(null, 204);
});

export default equipmentRecords;

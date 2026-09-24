import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';
import { balanceExpr } from '../lib/stockBalance.js';

// F-LAB-001 Equipment Monitoring Record. F-LAB-010 carries equipment in
// aggregate -- one items row with a quantity -- but each physical unit needs
// its own "201 file", so this router serves equipment_records (one row per
// unit), not items. An :id here is a unit id.
const equipment = new Hono();
equipment.use('*', requireAuth);

// The System Equipment ID is derived rather than stored so it can never drift
// from the row it names.
const UNIT_SELECT = `
  SELECT er.id, er.item_id, er.laboratory_id, er.unit_no, er.serial_number, er.location,
    er.status, er.retired_at, er.retired_reason, er.created_at,
    'EQ-' || er.item_id || '-' || printf('%03d', er.unit_no) AS equipment_code,
    i.item_name AS name_description, i.category,
    l.name AS laboratory_name, l.department_id, l.status AS lab_status, d.name AS department_name
  FROM equipment_records er
  JOIN items i ON i.id = er.item_id
  JOIN laboratories l ON l.id = er.laboratory_id
  JOIN departments d ON d.id = l.department_id
`;

function userCanAccessEquipment(user, row) {
  if (!row) return false;
  if (user.role === 'admin') return true;
  return Number(row.department_id) === Number(user.department_id) && row.lab_status === 'approved';
}

// Bring a lab's unit records up to its equipment quantities. Units are only
// ever added: a unit that left the lab is retired by the custodian, since
// only they know which serial went, and its 201 file has to survive as
// history regardless. Running this on read keeps the record in step however
// the quantity moved -- applying a count, a stock transaction, an admin
// correction -- without every one of those paths having to know about units.
async function syncUnitsForLab(db, laboratoryId) {
  const items = await dbAll(
    db,
    `SELECT i.id,
       ${balanceExpr('i')} AS balance,
       (SELECT COUNT(*) FROM equipment_records er WHERE er.item_id = i.id AND er.status = 'Active') AS active_units,
       (SELECT COALESCE(MAX(er.unit_no), 0) FROM equipment_records er WHERE er.item_id = i.id) AS max_unit_no
     FROM items i
     WHERE i.laboratory_id = ? AND i.category = 'Equipment'`,
    laboratoryId
  );

  for (const item of items) {
    const missing = Number(item.balance) - Number(item.active_units);
    if (missing <= 0) continue;
    for (let n = 1; n <= missing; n++) {
      await dbRun(
        db,
        'INSERT INTO equipment_records (item_id, laboratory_id, unit_no) VALUES (?, ?, ?)',
        item.id,
        laboratoryId,
        Number(item.max_unit_no) + n
      );
    }
  }
}

equipment.get('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id } = c.req.query();
  if (!laboratory_id) return c.json({ error: 'laboratory_id is required' }, 400);

  const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
  if (!lab) return c.json({ error: 'Laboratory not found' }, 404);
  if (!userCanAccessEquipment(user, { department_id: lab.department_id, lab_status: lab.status })) {
    return c.json({ error: 'You do not have access to this laboratory' }, 403);
  }

  await syncUnitsForLab(c.env.DB, laboratory_id);

  return c.json(
    await dbAll(
      c.env.DB,
      UNIT_SELECT + ' WHERE er.laboratory_id = ? ORDER BY i.item_name, er.unit_no',
      laboratory_id
    )
  );
});

equipment.get('/:id', async (c) => {
  const user = c.get('user');
  const row = await dbGet(c.env.DB, UNIT_SELECT + ' WHERE er.id = ?', c.req.param('id'));
  if (!row) return c.json({ error: 'Equipment unit not found' }, 404);
  if (!userCanAccessEquipment(user, row)) {
    return c.json({ error: 'You do not have access to this equipment' }, 403);
  }
  return c.json(row);
});

equipment.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, UNIT_SELECT + ' WHERE er.id = ?', id);
  if (!existing) return c.json({ error: 'Equipment unit not found' }, 404);
  if (!userCanAccessEquipment(user, existing)) {
    return c.json({ error: 'You do not have access to this equipment' }, 403);
  }

  const { serial_number, location } = await c.req.json().catch(() => ({}));
  await dbRun(
    c.env.DB,
    'UPDATE equipment_records SET serial_number = ?, location = ? WHERE id = ?',
    serial_number?.trim() ?? existing.serial_number,
    location?.trim() ?? existing.location,
    id
  );
  return c.json(await dbGet(c.env.DB, UNIT_SELECT + ' WHERE er.id = ?', id));
});

// Retiring is how a unit leaves the lab. The row and its service history stay
// -- a disposed unit's 201 file is still the record of what happened to it.
//
// It also books a stock movement of 1 against the item, because the unit
// physically left: without that the balance still reads 5 while only 4 units
// remain, and the sync above would read the gap as a missing unit and
// immediately generate a replacement for the one just retired.
equipment.post('/:id/retire', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, UNIT_SELECT + ' WHERE er.id = ?', id);
  if (!existing) return c.json({ error: 'Equipment unit not found' }, 404);
  if (!userCanAccessEquipment(user, existing)) {
    return c.json({ error: 'You do not have access to this equipment' }, 403);
  }
  if (existing.status === 'Retired') return c.json({ error: 'This unit is already retired' }, 400);

  const { reason } = await c.req.json().catch(() => ({}));
  const note = reason?.trim() || null;
  await dbRun(
    c.env.DB,
    "UPDATE equipment_records SET status = 'Retired', retired_at = datetime('now'), retired_reason = ? WHERE id = ?",
    note,
    id
  );
  await dbRun(
    c.env.DB,
    `INSERT INTO transactions (item_id, entry_date, in_qty, out_qty, remarks, handled_by, created_by)
     VALUES (?, date('now'), 0, 1, ?, ?, ?)`,
    existing.item_id,
    `Retired ${existing.equipment_code}${note ? ` -- ${note}` : ''}`,
    user.full_name,
    user.id
  );
  return c.json(await dbGet(c.env.DB, UNIT_SELECT + ' WHERE er.id = ?', id));
});

equipment.get('/:id/logs', async (c) => {
  const user = c.get('user');
  const unit = await dbGet(c.env.DB, UNIT_SELECT + ' WHERE er.id = ?', c.req.param('id'));
  if (!unit) return c.json({ error: 'Equipment unit not found' }, 404);
  if (!userCanAccessEquipment(user, unit)) {
    return c.json({ error: 'You do not have access to this equipment' }, 403);
  }
  return c.json(
    await dbAll(
      c.env.DB,
      'SELECT * FROM equipment_logs WHERE equipment_record_id = ? ORDER BY entry_date ASC, id ASC',
      unit.id
    )
  );
});

equipment.post('/:id/logs', async (c) => {
  const user = c.get('user');
  const unit = await dbGet(c.env.DB, UNIT_SELECT + ' WHERE er.id = ?', c.req.param('id'));
  if (!unit) return c.json({ error: 'Equipment unit not found' }, 404);
  if (!userCanAccessEquipment(user, unit)) {
    return c.json({ error: 'You do not have access to this equipment' }, 403);
  }

  const { entry_date, service_performed, request_id, status, logged_by } = await c.req.json().catch(() => ({}));
  if (!entry_date || !service_performed?.trim()) {
    return c.json({ error: 'entry_date and service_performed are required' }, 400);
  }

  const result = await dbRun(
    c.env.DB,
    `INSERT INTO equipment_logs (equipment_id, equipment_record_id, entry_date, service_performed, request_id, status, logged_by, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    unit.item_id,
    unit.id,
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
  const unit = await dbGet(c.env.DB, UNIT_SELECT + ' WHERE er.id = ?', c.req.param('id'));
  if (!unit) return c.json({ error: 'Equipment unit not found' }, 404);
  if (!userCanAccessEquipment(user, unit)) {
    return c.json({ error: 'You do not have access to this equipment' }, 403);
  }
  const log = await dbGet(
    c.env.DB,
    'SELECT * FROM equipment_logs WHERE id = ? AND equipment_record_id = ?',
    c.req.param('logId'),
    unit.id
  );
  if (!log) return c.json({ error: 'Log entry not found' }, 404);
  await dbRun(c.env.DB, 'DELETE FROM equipment_logs WHERE id = ?', log.id);
  return c.body(null, 204);
});

export default equipment;

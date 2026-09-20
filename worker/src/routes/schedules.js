import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';
import { logEquipmentService } from '../lib/autoLogEquipment.js';

// F-LAB-002 Preventive Maintenance Schedule and F-LAB-003 Equipment
// Calibration Schedule are identically shaped, so both routers are built
// from this one factory, parametrized by their (fixed, hardcoded) table
// name, the equipment_logs service type it corresponds to, and a short
// label used to tag the auto-logged entry's request_id.
export function createScheduleRoutes(table, serviceType, scheduleLabel) {
  const router = new Hono();
  router.use('*', requireAuth);

  const SELECT = `
    SELECT s.*, l.name AS laboratory_name, l.department_id, l.status AS lab_status, d.name AS department_name
    FROM ${table} s
    JOIN laboratories l ON l.id = s.laboratory_id
    JOIN departments d ON d.id = l.department_id
  `;

  function labAccessibleToUser(user, lab) {
    if (!lab) return false;
    if (user.role === 'admin') return true;
    return Number(lab.department_id) === Number(user.department_id) && lab.status === 'approved';
  }

  function userCanAccessRow(user, row) {
    if (!row) return false;
    if (user.role === 'admin') return true;
    return Number(row.department_id) === Number(user.department_id) && row.lab_status === 'approved';
  }

  router.get('/', async (c) => {
    const user = c.get('user');
    const { laboratory_id } = c.req.query();
    const clauses = [];
    const params = [];

    if (user.role !== 'admin') {
      clauses.push('l.department_id = ?', "l.status = 'approved'");
      params.push(user.department_id);
    }
    if (laboratory_id) {
      clauses.push('s.laboratory_id = ?');
      params.push(laboratory_id);
    }

    let sql = SELECT;
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    // Latest date of service first -- SQLite treats NULL as lowest, so
    // undated rows naturally sort to the end here rather than needing a
    // separate NULLS LAST clause.
    sql += ' ORDER BY s.scheduled_date DESC, s.id DESC';

    return c.json(await dbAll(c.env.DB, sql, ...params));
  });

  router.post('/', async (c) => {
    const user = c.get('user');
    const {
      laboratory_id,
      equipment_item_id,
      equipment_name_description,
      serial_number,
      frequency,
      department,
      location,
      scheduled_date,
    } = await c.req.json().catch(() => ({}));
    if (!laboratory_id || !equipment_name_description?.trim()) {
      return c.json({ error: 'laboratory_id and equipment_name_description are required' }, 400);
    }

    const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
    if (!labAccessibleToUser(user, lab)) {
      return c.json({ error: 'You do not have access to that laboratory' }, 403);
    }

    const maxItemNo = await dbGet(
      c.env.DB,
      `SELECT COALESCE(MAX(item_no), 0) AS n FROM ${table} WHERE laboratory_id = ?`,
      laboratory_id
    );

    const result = await dbRun(
      c.env.DB,
      `INSERT INTO ${table} (laboratory_id, item_no, equipment_item_id, equipment_name_description, serial_number, frequency, department, location, scheduled_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      laboratory_id,
      maxItemNo.n + 1,
      equipment_item_id || null,
      equipment_name_description.trim(),
      serial_number?.trim() || null,
      frequency?.trim() || null,
      department?.trim() || null,
      location?.trim() || null,
      scheduled_date || null
    );
    return c.json(await dbGet(c.env.DB, SELECT + ' WHERE s.id = ?', result.lastInsertRowid), 201);
  });

  router.put('/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const existing = await dbGet(c.env.DB, SELECT + ' WHERE s.id = ?', id);
    if (!existing) return c.json({ error: 'Not found' }, 404);
    if (!userCanAccessRow(user, existing)) {
      return c.json({ error: 'You do not have access to this schedule item' }, 403);
    }

    const {
      equipment_item_id,
      equipment_name_description,
      serial_number,
      frequency,
      department,
      location,
      scheduled_date,
      actual_date,
      remarks,
    } = await c.req.json().catch(() => ({}));

    const newEquipmentItemId = equipment_item_id ?? existing.equipment_item_id;
    const newActualDate = actual_date ?? existing.actual_date;

    await dbRun(
      c.env.DB,
      `UPDATE ${table} SET equipment_item_id = ?, equipment_name_description = ?, serial_number = ?, frequency = ?, department = ?, location = ?,
         scheduled_date = ?, actual_date = ?, remarks = ? WHERE id = ?`,
      newEquipmentItemId || null,
      equipment_name_description?.trim() || existing.equipment_name_description,
      serial_number?.trim() ?? existing.serial_number,
      frequency?.trim() ?? existing.frequency,
      department?.trim() ?? existing.department,
      location?.trim() ?? existing.location,
      scheduled_date ?? existing.scheduled_date,
      newActualDate,
      remarks?.trim() ?? existing.remarks,
      id
    );

    // Filling in Actual Date for the first (or a new) time means this
    // maintenance/calibration was actually performed -- log it against the
    // equipment's own F-LAB-001 record, if it's linked to one.
    if (newActualDate && newActualDate !== existing.actual_date) {
      await logEquipmentService(c.env.DB, {
        equipmentItemId: newEquipmentItemId,
        entryDate: newActualDate,
        servicePerformed: serviceType,
        requestId: `${scheduleLabel}-${id}`,
        loggedBy: user.full_name,
        createdBy: user.id,
      });
    }

    return c.json(await dbGet(c.env.DB, SELECT + ' WHERE s.id = ?', id));
  });

  router.delete('/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const existing = await dbGet(c.env.DB, SELECT + ' WHERE s.id = ?', id);
    if (!existing) return c.json({ error: 'Not found' }, 404);
    if (!userCanAccessRow(user, existing)) {
      return c.json({ error: 'You do not have access to this schedule item' }, 403);
    }
    await dbRun(c.env.DB, `DELETE FROM ${table} WHERE id = ?`, id);
    return c.body(null, 204);
  });

  return router;
}

export const maintenanceScheduleRoutes = createScheduleRoutes('maintenance_schedule_items', 'Preventive', 'PMS');
export const calibrationScheduleRoutes = createScheduleRoutes('calibration_schedule_items', 'Calibration', 'ECS');

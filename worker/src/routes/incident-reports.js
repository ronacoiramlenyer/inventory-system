import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

// F-LAB-009 Laboratory Incident Report: one record per incident.
const incidentReports = new Hono();
incidentReports.use('*', requireAuth);

const SELECT = `
  SELECT r.*, l.name AS laboratory_name, l.department_id, l.status AS lab_status, d.name AS department_name
  FROM incident_reports r
  JOIN laboratories l ON l.id = r.laboratory_id
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

incidentReports.get('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id } = c.req.query();
  const clauses = [];
  const params = [];

  if (user.role !== 'admin') {
    clauses.push('l.department_id = ?', "l.status = 'approved'");
    params.push(user.department_id);
  }
  if (laboratory_id) {
    clauses.push('r.laboratory_id = ?');
    params.push(laboratory_id);
  }

  let sql = SELECT;
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY r.created_at DESC';

  return c.json(await dbAll(c.env.DB, sql, ...params));
});

incidentReports.get('/:id', async (c) => {
  const user = c.get('user');
  const row = await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', c.req.param('id'));
  if (!row) return c.json({ error: 'Incident report not found' }, 404);
  if (!userCanAccessRow(user, row)) {
    return c.json({ error: 'You do not have access to this incident report' }, 403);
  }
  return c.json(row);
});

incidentReports.post('/', async (c) => {
  const user = c.get('user');
  const {
    laboratory_id,
    incident_datetime,
    class_name,
    teacher,
    incident_types,
    incident_type_other,
    individuals_involved,
    detailed_description,
    immediate_actions_taken,
    prepared_by,
    designation,
  } = await c.req.json().catch(() => ({}));

  if (!laboratory_id || !incident_datetime?.trim()) {
    return c.json({ error: 'laboratory_id and incident_datetime are required' }, 400);
  }

  const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
  if (!labAccessibleToUser(user, lab)) {
    return c.json({ error: 'You do not have access to that laboratory' }, 403);
  }

  const result = await dbRun(
    c.env.DB,
    `INSERT INTO incident_reports
      (laboratory_id, incident_datetime, class_name, teacher, incident_types, incident_type_other,
       individuals_involved, detailed_description, immediate_actions_taken, prepared_by, designation, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    laboratory_id,
    incident_datetime.trim(),
    class_name?.trim() || null,
    teacher?.trim() || null,
    Array.isArray(incident_types) ? incident_types.join(', ') : incident_types?.trim() || null,
    incident_type_other?.trim() || null,
    individuals_involved?.trim() || null,
    detailed_description?.trim() || null,
    immediate_actions_taken?.trim() || null,
    prepared_by?.trim() || user.full_name,
    designation?.trim() || null,
    user.id
  );
  return c.json(await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', result.lastInsertRowid), 201);
});

incidentReports.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', id);
  if (!existing) return c.json({ error: 'Incident report not found' }, 404);
  if (!userCanAccessRow(user, existing)) {
    return c.json({ error: 'You do not have access to this incident report' }, 403);
  }

  const {
    incident_datetime,
    class_name,
    teacher,
    incident_types,
    incident_type_other,
    individuals_involved,
    detailed_description,
    immediate_actions_taken,
    prepared_by,
    designation,
  } = await c.req.json().catch(() => ({}));

  await dbRun(
    c.env.DB,
    `UPDATE incident_reports SET incident_datetime = ?, class_name = ?, teacher = ?, incident_types = ?,
       incident_type_other = ?, individuals_involved = ?, detailed_description = ?, immediate_actions_taken = ?,
       prepared_by = ?, designation = ? WHERE id = ?`,
    incident_datetime?.trim() || existing.incident_datetime,
    class_name?.trim() ?? existing.class_name,
    teacher?.trim() ?? existing.teacher,
    Array.isArray(incident_types) ? incident_types.join(', ') : incident_types?.trim() ?? existing.incident_types,
    incident_type_other?.trim() ?? existing.incident_type_other,
    individuals_involved?.trim() ?? existing.individuals_involved,
    detailed_description?.trim() ?? existing.detailed_description,
    immediate_actions_taken?.trim() ?? existing.immediate_actions_taken,
    prepared_by?.trim() || existing.prepared_by,
    designation?.trim() ?? existing.designation,
    id
  );
  return c.json(await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', id));
});

incidentReports.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', id);
  if (!existing) return c.json({ error: 'Incident report not found' }, 404);
  if (!userCanAccessRow(user, existing)) {
    return c.json({ error: 'You do not have access to this incident report' }, 403);
  }
  await dbRun(c.env.DB, 'DELETE FROM incident_reports WHERE id = ?', id);
  return c.body(null, 204);
});

export default incidentReports;

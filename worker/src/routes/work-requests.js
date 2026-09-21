import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';
import { logEquipmentService } from '../lib/autoLogEquipment.js';

// F-LAB-004 Equipment Work Request (the official per-request form) and
// F-LAB-005 Equipment Monitoring Sheet (the per-lab log of those requests)
// are two views over this one table.
const workRequests = new Hono();
workRequests.use('*', requireAuth);

const SELECT = `
  SELECT w.*, l.name AS laboratory_name, l.department_id, l.status AS lab_status, d.name AS department_name,
    'EQ-' || er.item_id || '-' || printf('%03d', er.unit_no) AS equipment_code
  FROM work_requests w
  JOIN laboratories l ON l.id = w.laboratory_id
  JOIN departments d ON d.id = l.department_id
  LEFT JOIN equipment_records er ON er.id = w.equipment_record_id
`;

// Staff/Subject Coordinator are tied to exactly one department
// (user.department_id); a Secretary can cover several (user.department_ids,
// from the secretary_departments join table -- see routes/users.js).
function inUserScope(user, row) {
  if (user.role === 'secretary') {
    return (user.department_ids || []).map(Number).includes(Number(row.department_id));
  }
  return Number(row.department_id) === Number(user.department_id);
}

function labAccessibleToUser(user, lab) {
  if (!lab) return false;
  if (user.role === 'admin') return true;
  return inUserScope(user, lab) && lab.status === 'approved';
}

// A Secretary only sees requests once they've been filed (approved) -- a
// Pending one hasn't reached her yet, so it's outside her access entirely.
function userCanAccessRow(user, row) {
  if (!row) return false;
  if (user.role === 'admin') return true;
  if (!inUserScope(user, row) || row.lab_status !== 'approved') return false;
  if (user.role === 'secretary') return row.status !== 'Pending';
  return true;
}

// Only an admin, or the Subject Coordinator of the request's own department,
// may approve/file a request.
function userCanApprove(user, row) {
  if (!row) return false;
  if (user.role === 'admin') return true;
  return user.role === 'subject_coordinator' && inUserScope(user, row);
}

// Once filed, the Subject Coordinator/admin and the department's Secretary
// can both move the status forward -- to In Progress or Rejected. Neither
// of them marks it Completed, though: see userCanCompleteWork below.
function userCanManageFiled(user, row) {
  if (!row) return false;
  if (userCanApprove(user, row)) return true;
  return user.role === 'secretary' && inUserScope(user, row);
}

// Completed is the lab custodian's (staff's) call, not the Secretary's --
// the Secretary marks a request In Progress to hand it to staff, and staff
// is the one who actually did (or verified) the work, so they're the one
// who confirms it's done. A Subject Coordinator/admin can still complete a
// request directly, same override power they have over every other status.
function userCanCompleteWork(user, row) {
  if (!row) return false;
  if (userCanApprove(user, row)) return true;
  return user.role === 'staff' && inUserScope(user, row);
}

async function nextRequestNo(db) {
  const year = new Date().getFullYear();
  const prefix = `EWR-${year}-`;
  const row = await dbGet(
    db,
    `SELECT COUNT(*) AS n FROM work_requests WHERE request_no LIKE ?`,
    `${prefix}%`
  );
  const seq = String(row.n + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

// PMS (F-LAB-002) and ECS (F-LAB-003) entries describe maintenance/calibration
// that's *due*, possibly well ahead of time -- they don't become an actual,
// sendable request until someone turns that due entry into a real EWR. This
// lists every PMS/ECS row for the lab that hasn't been turned into one yet
// (regardless of how far off its scheduled_date is), so staff have a single
// place to see what's ready to file, alongside ad-hoc Repair requests which
// skip this list entirely and go straight to "+ New Request".
workRequests.get('/pending-schedule', async (c) => {
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

  async function pending(table, sourceType) {
    let sql = `
      SELECT s.id, s.laboratory_id, s.equipment_item_id, s.equipment_record_id, s.equipment_name_description, s.serial_number,
        s.frequency, s.department, s.location, s.scheduled_date, '${sourceType}' AS source_type
      FROM ${table} s
      JOIN laboratories l ON l.id = s.laboratory_id
      WHERE NOT EXISTS (
        SELECT 1 FROM work_requests w
        WHERE w.source_type = '${sourceType}' AND w.source_schedule_id = s.id AND w.status != 'Rejected'
      )
    `;
    if (clauses.length) sql += ' AND ' + clauses.join(' AND ');
    return dbAll(c.env.DB, sql, ...params);
  }

  const [pms, ecs] = await Promise.all([
    pending('maintenance_schedule_items', 'PMS'),
    pending('calibration_schedule_items', 'ECS'),
  ]);
  const combined = [...pms, ...ecs].sort((a, b) => {
    if (!a.scheduled_date) return 1;
    if (!b.scheduled_date) return -1;
    return a.scheduled_date.localeCompare(b.scheduled_date);
  });
  return c.json(combined);
});

workRequests.get('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id } = c.req.query();
  const clauses = [];
  const params = [];

  if (user.role === 'secretary') {
    const departmentIds = user.department_ids || [];
    const placeholders = departmentIds.map(() => '?').join(',') || 'NULL';
    clauses.push(`l.department_id IN (${placeholders})`, "l.status = 'approved'", "w.status != 'Pending'");
    params.push(...departmentIds);
  } else if (user.role !== 'admin') {
    clauses.push('l.department_id = ?', "l.status = 'approved'");
    params.push(user.department_id);
  }
  if (laboratory_id) {
    clauses.push('w.laboratory_id = ?');
    params.push(laboratory_id);
  }

  let sql = SELECT;
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY w.created_at DESC';

  return c.json(await dbAll(c.env.DB, sql, ...params));
});

workRequests.get('/:id', async (c) => {
  const user = c.get('user');
  const row = await dbGet(c.env.DB, SELECT + ' WHERE w.id = ?', c.req.param('id'));
  if (!row) return c.json({ error: 'Work request not found' }, 404);
  if (!userCanAccessRow(user, row)) {
    return c.json({ error: 'You do not have access to this work request' }, 403);
  }
  return c.json(row);
});

workRequests.post('/', async (c) => {
  const user = c.get('user');
  // An EWR has to originate from the lab custodian (staff), same as a
  // Borrowing Request and a PMS/ECS schedule entry -- the Subject
  // Coordinator approves/files it, the Secretary works it, neither of them
  // originates it.
  if (user.role !== 'staff' && user.role !== 'admin') {
    return c.json({ error: 'Only the lab custodian (staff) can file an Equipment Work Request' }, 403);
  }
  const {
    laboratory_id,
    equipment_item_id,
    equipment_record_id,
    equipment_name_description,
    serial_number,
    date_needed,
    nature_of_request,
    detailed_description,
    requested_by,
    source_type,
    source_schedule_id,
  } = await c.req.json().catch(() => ({}));

  if (!laboratory_id || !equipment_name_description?.trim()) {
    return c.json({ error: 'laboratory_id and equipment_name_description are required' }, 400);
  }

  const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
  if (!labAccessibleToUser(user, lab)) {
    return c.json({ error: 'You do not have access to that laboratory' }, 403);
  }

  // Filing from a PMS/ECS due entry (see GET /pending-schedule) -- make sure
  // it hasn't already been turned into a request by someone else in the
  // meantime, so the same due date doesn't end up with two live EWRs. A
  // Rejected one doesn't count -- that's exactly what reopens the entry in
  // /pending-schedule for re-filing, so the guard has to agree with it.
  if (source_type && source_schedule_id) {
    const already = await dbGet(
      c.env.DB,
      "SELECT id FROM work_requests WHERE source_type = ? AND source_schedule_id = ? AND status != 'Rejected'",
      source_type,
      source_schedule_id
    );
    if (already) {
      return c.json({ error: 'This schedule entry already has an EWR filed for it' }, 409);
    }
  }

  const requestNo = await nextRequestNo(c.env.DB);
  const today = new Date().toISOString().slice(0, 10);

  const result = await dbRun(
    c.env.DB,
    `INSERT INTO work_requests
      (laboratory_id, request_no, equipment_item_id, equipment_record_id, equipment_name_description, serial_number, date_requested, date_needed,
       nature_of_request, detailed_description, requested_by, status, created_by, source_type, source_schedule_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    laboratory_id,
    requestNo,
    equipment_item_id || null,
    equipment_record_id || null,
    equipment_name_description.trim(),
    serial_number?.trim() || null,
    today,
    date_needed || null,
    nature_of_request?.trim() || null,
    detailed_description?.trim() || null,
    requested_by?.trim() || user.full_name,
    // Awaits Subject Coordinator approval before it's filed for the Secretary to see.
    'Pending',
    user.id,
    source_type?.trim() || null,
    source_schedule_id || null
  );
  const created = await dbGet(c.env.DB, SELECT + ' WHERE w.id = ?', result.lastInsertRowid);
  return c.json(created, 201);
});

// Subject Coordinator (or admin) approval: files the request so the
// department's Secretary can see it and work it.
workRequests.post('/:id/approve', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, SELECT + ' WHERE w.id = ?', id);
  if (!existing) return c.json({ error: 'Work request not found' }, 404);
  if (!userCanApprove(user, existing)) {
    return c.json({ error: 'Only the Subject Coordinator for this department can approve this request' }, 403);
  }
  if (existing.status !== 'Pending') {
    return c.json({ error: `This request is already ${existing.status}` }, 400);
  }

  await dbRun(
    c.env.DB,
    `UPDATE work_requests SET status = 'Filed', approved_by = ? WHERE id = ?`,
    user.full_name,
    id
  );
  return c.json(await dbGet(c.env.DB, SELECT + ' WHERE w.id = ?', id));
});

workRequests.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, SELECT + ' WHERE w.id = ?', id);
  if (!existing) return c.json({ error: 'Work request not found' }, 404);
  if (!userCanAccessRow(user, existing)) {
    return c.json({ error: 'You do not have access to this work request' }, 403);
  }

  const {
    equipment_item_id,
    equipment_record_id,
    equipment_name_description,
    serial_number,
    date_needed,
    nature_of_request,
    detailed_description,
    requested_by,
    approved_by,
    status,
    date_completed,
    remarks,
  } = await c.req.json().catch(() => ({}));

  // Approved-by is the Subject Coordinator's identity, so only they/admin can
  // set it. Filed/In Progress/Rejected move once the department's Secretary
  // is working the request; Completed is staff's call specifically (or a
  // Coordinator/admin override) -- see userCanCompleteWork.
  const canApprove = userCanApprove(user, existing);
  const canManage = userCanManageFiled(user, existing);
  const canCompleteWork = userCanCompleteWork(user, existing);
  const newEquipmentItemId = equipment_item_id ?? existing.equipment_item_id;
  const newEquipmentRecordId = equipment_record_id ?? existing.equipment_record_id;

  const desiredStatus = status?.trim();
  let newStatus = existing.status;
  if (desiredStatus === 'Completed') {
    if (canCompleteWork) newStatus = 'Completed';
  } else if (desiredStatus && canManage) {
    newStatus = desiredStatus;
  }
  const canTouchCompletion = canManage || canCompleteWork;
  const newDateCompleted = canTouchCompletion ? date_completed ?? existing.date_completed : existing.date_completed;

  await dbRun(
    c.env.DB,
    `UPDATE work_requests SET equipment_item_id = ?, equipment_record_id = ?, equipment_name_description = ?, serial_number = ?, date_needed = ?,
       nature_of_request = ?, detailed_description = ?, requested_by = ?, approved_by = ?, status = ?,
       date_completed = ?, remarks = ? WHERE id = ?`,
    newEquipmentItemId || null,
    newEquipmentRecordId || null,
    equipment_name_description?.trim() || existing.equipment_name_description,
    serial_number?.trim() ?? existing.serial_number,
    date_needed ?? existing.date_needed,
    nature_of_request?.trim() ?? existing.nature_of_request,
    detailed_description?.trim() ?? existing.detailed_description,
    requested_by?.trim() ?? existing.requested_by,
    canApprove ? approved_by?.trim() ?? existing.approved_by : existing.approved_by,
    newStatus,
    newDateCompleted,
    remarks?.trim() ?? existing.remarks,
    id
  );

  // Moving to Completed for the first time means the work actually
  // happened -- log it against the equipment's own F-LAB-001 record, if
  // it's linked to one.
  if (newStatus === 'Completed' && existing.status !== 'Completed') {
    await logEquipmentService(c.env.DB, {
      equipmentItemId: newEquipmentItemId,
      equipmentRecordId: newEquipmentRecordId,
      entryDate: newDateCompleted || new Date().toISOString().slice(0, 10),
      servicePerformed: nature_of_request?.trim() || existing.nature_of_request,
      requestId: existing.request_no,
      loggedBy: user.full_name,
      createdBy: user.id,
    });
  }

  return c.json(await dbGet(c.env.DB, SELECT + ' WHERE w.id = ?', id));
});

workRequests.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, SELECT + ' WHERE w.id = ?', id);
  if (!existing) return c.json({ error: 'Work request not found' }, 404);
  if (!userCanAccessRow(user, existing)) {
    return c.json({ error: 'You do not have access to this work request' }, 403);
  }
  await dbRun(c.env.DB, 'DELETE FROM work_requests WHERE id = ?', id);
  return c.body(null, 204);
});

export default workRequests;

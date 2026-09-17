import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

// Bookstore Requisition Slip and Supplies Requisition Slip are identically
// shaped, so both routers are built from this one factory, parametrized by
// their (fixed, hardcoded) table name. Same Pending -> Subject Coordinator
// approval -> Filed -> Secretary fulfillment workflow as F-LAB-004.
export function createRequisitionRoutes(table) {
  const router = new Hono();
  router.use('*', requireAuth);

  const SELECT = `
    SELECT r.*, l.name AS laboratory_name, l.department_id, l.status AS lab_status, d.name AS department_name
    FROM ${table} r
    JOIN laboratories l ON l.id = r.laboratory_id
    JOIN departments d ON d.id = l.department_id
  `;

  // Staff/Subject Coordinator are tied to exactly one department
  // (user.department_id); a Secretary can cover several (user.department_ids).
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

  // A Secretary only sees a request once it's been filed (approved).
  function userCanAccessRow(user, row) {
    if (!row) return false;
    if (user.role === 'admin') return true;
    if (!inUserScope(user, row) || row.lab_status !== 'approved') return false;
    if (user.role === 'secretary') return row.status !== 'Pending';
    return true;
  }

  // Only an admin, or the Subject Coordinator of the request's own
  // department, may approve/file a request.
  function userCanApprove(user, row) {
    if (!row) return false;
    if (user.role === 'admin') return true;
    return user.role === 'subject_coordinator' && inUserScope(user, row);
  }

  // Once filed, the Subject Coordinator/admin and the department's
  // Secretary can both move the status forward.
  function userCanManageFiled(user, row) {
    if (!row) return false;
    if (userCanApprove(user, row)) return true;
    return user.role === 'secretary' && inUserScope(user, row);
  }

  router.get('/', async (c) => {
    const user = c.get('user');
    const { laboratory_id } = c.req.query();
    const clauses = [];
    const params = [];

    if (user.role === 'secretary') {
      const departmentIds = user.department_ids || [];
      const placeholders = departmentIds.map(() => '?').join(',') || 'NULL';
      clauses.push(`l.department_id IN (${placeholders})`, "l.status = 'approved'", "r.status != 'Pending'");
      params.push(...departmentIds);
    } else if (user.role !== 'admin') {
      clauses.push('l.department_id = ?', "l.status = 'approved'");
      params.push(user.department_id);
    }
    if (laboratory_id) {
      clauses.push('r.laboratory_id = ?');
      params.push(laboratory_id);
    }

    let sql = SELECT;
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY r.request_date DESC, r.id DESC';

    return c.json(await dbAll(c.env.DB, sql, ...params));
  });

  router.post('/', async (c) => {
    const user = c.get('user');
    const { laboratory_id, request_date, item_description, quantity, unit, purpose, requested_by } =
      await c.req.json().catch(() => ({}));
    if (!laboratory_id || !request_date || !item_description?.trim()) {
      return c.json({ error: 'laboratory_id, request_date and item_description are required' }, 400);
    }

    const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
    if (!labAccessibleToUser(user, lab)) {
      return c.json({ error: 'You do not have access to that laboratory' }, 403);
    }

    const result = await dbRun(
      c.env.DB,
      `INSERT INTO ${table} (laboratory_id, request_date, item_description, quantity, unit, purpose, requested_by, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      laboratory_id,
      request_date,
      item_description.trim(),
      quantity?.trim() || null,
      unit?.trim() || null,
      purpose?.trim() || null,
      requested_by?.trim() || user.full_name,
      // Awaits Subject Coordinator approval before it's filed for the Secretary to see.
      'Pending',
      user.id
    );
    return c.json(await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', result.lastInsertRowid), 201);
  });

  // Subject Coordinator (or admin) approval: files the request so the
  // department's Secretary can see it and work it.
  router.post('/:id/approve', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const existing = await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', id);
    if (!existing) return c.json({ error: 'Not found' }, 404);
    if (!userCanApprove(user, existing)) {
      return c.json({ error: 'Only the Subject Coordinator for this department can approve this request' }, 403);
    }
    if (existing.status !== 'Pending') {
      return c.json({ error: `This request is already ${existing.status}` }, 400);
    }

    await dbRun(c.env.DB, `UPDATE ${table} SET status = 'Filed', approved_by = ? WHERE id = ?`, user.full_name, id);
    return c.json(await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', id));
  });

  router.put('/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const existing = await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', id);
    if (!existing) return c.json({ error: 'Not found' }, 404);
    if (!userCanAccessRow(user, existing)) {
      return c.json({ error: 'You do not have access to this requisition' }, 403);
    }

    const { request_date, item_description, quantity, unit, purpose, requested_by, approved_by, status } =
      await c.req.json().catch(() => ({}));

    // Approved-by is the Subject Coordinator's identity, so only they/admin
    // can set it. Status can also move once the department's Secretary is
    // working the filed request.
    const canApprove = userCanApprove(user, existing);
    const canManage = userCanManageFiled(user, existing);

    await dbRun(
      c.env.DB,
      `UPDATE ${table} SET request_date = ?, item_description = ?, quantity = ?, unit = ?, purpose = ?,
         requested_by = ?, approved_by = ?, status = ? WHERE id = ?`,
      request_date || existing.request_date,
      item_description?.trim() || existing.item_description,
      quantity?.trim() ?? existing.quantity,
      unit?.trim() ?? existing.unit,
      purpose?.trim() ?? existing.purpose,
      requested_by?.trim() ?? existing.requested_by,
      canApprove ? approved_by?.trim() ?? existing.approved_by : existing.approved_by,
      canManage ? status || existing.status : existing.status,
      id
    );
    return c.json(await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', id));
  });

  router.delete('/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const existing = await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', id);
    if (!existing) return c.json({ error: 'Not found' }, 404);
    if (!userCanAccessRow(user, existing)) {
      return c.json({ error: 'You do not have access to this requisition' }, 403);
    }
    if (existing.status !== 'Pending' && user.role !== 'admin') {
      return c.json({ error: 'Only an admin can delete a filed request' }, 403);
    }
    await dbRun(c.env.DB, `DELETE FROM ${table} WHERE id = ?`, id);
    return c.body(null, 204);
  });

  return router;
}

export const bookstoreRequisitionRoutes = createRequisitionRoutes('bookstore_requisitions');
export const suppliesRequisitionRoutes = createRequisitionRoutes('supplies_requisitions');

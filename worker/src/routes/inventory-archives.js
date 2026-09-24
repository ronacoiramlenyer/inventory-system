import { Hono } from 'hono';
import { dbAll, dbGet } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

// Read-only by design: an archived F-LAB-010 is the signed record of a
// completed inventory period, so there is no PUT, no DELETE and no route
// that touches inventory_archive_items. The only way a row gets here is
// Close Inventory.
const inventoryArchives = new Hono();
inventoryArchives.use('*', requireAuth);

function visibleToUser(user, archive) {
  if (!archive) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'secretary') {
    return (user.department_ids || []).map(Number).includes(Number(archive.department_id));
  }
  return Number(archive.department_id) === Number(user.department_id);
}

inventoryArchives.get('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id } = c.req.query();
  const clauses = [];
  const params = [];

  if (user.role === 'secretary') {
    const ids = (user.department_ids || []).map(Number);
    if (!ids.length) return c.json([]);
    clauses.push(`ia.department_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  } else if (user.role !== 'admin') {
    clauses.push('ia.department_id = ?');
    params.push(user.department_id);
  }
  if (laboratory_id) {
    clauses.push('ia.laboratory_id = ?');
    params.push(laboratory_id);
  }

  let sql = 'SELECT * FROM inventory_archives ia';
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  // Newest period first, and the reference number breaks a tie between two
  // laboratories counted on the same day.
  sql += ' ORDER BY ia.inventory_date DESC, ia.reference_no DESC';

  return c.json(await dbAll(c.env.DB, sql, ...params));
});

inventoryArchives.get('/:id', async (c) => {
  const user = c.get('user');
  const archive = await dbGet(c.env.DB, 'SELECT * FROM inventory_archives WHERE id = ?', c.req.param('id'));
  if (!archive) return c.json({ error: 'Archived inventory not found' }, 404);
  if (!visibleToUser(user, archive)) {
    return c.json({ error: 'You do not have access to this archived inventory' }, 403);
  }
  const items = await dbAll(
    c.env.DB,
    'SELECT * FROM inventory_archive_items WHERE inventory_archive_id = ? ORDER BY item_no',
    archive.id
  );
  return c.json({ ...archive, items });
});

export default inventoryArchives;

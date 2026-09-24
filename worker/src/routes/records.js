import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';
import { addSignedCopyRoutes } from '../lib/signedCopy.js';
import { DOCUMENT_CODES, RECORD_CODES, findRecordCode } from '../lib/recordCodes.js';

const records = new Hono();
records.use('*', requireAuth);

// Which laboratories' records a person may count and read, as a SQL clause
// against the `l` (laboratories) alias. Mirrors the scoping every other
// listing route uses: an admin sees everything, a Secretary their assigned
// departments, everyone else their own.
function scopeFor(user) {
  if (user.role === 'admin') return { clause: '1 = 1', params: [] };
  if (user.role === 'secretary') {
    const ids = (user.department_ids || []).map(Number);
    if (!ids.length) return { clause: '1 = 0', params: [] };
    return { clause: `l.department_id IN (${ids.map(() => '?').join(',')})`, params: ids };
  }
  return { clause: 'l.department_id = ?', params: [user.department_id] };
}

// The approved CAPEX and OPEX are the school's budget documents, so they are
// not scoped to one laboratory the way a lab's own forms are. Read is open to
// the roles that plan against a budget; only an admin files or removes one.
function canReadDocuments(user) {
  return ['admin', 'secretary', 'subject_coordinator', 'staff'].includes(user.role);
}
function canWriteDocuments(user) {
  return user.role === 'admin';
}

// The register: every retained record type, what it holds, where it lives,
// and how many of it this person can see.
records.get('/', async (c) => {
  const user = c.get('user');
  const scope = scopeFor(user);

  const rows = [];
  for (const record of RECORD_CODES) {
    let count = null;
    if (record.kind === 'document') {
      if (canReadDocuments(user)) {
        const r = await dbGet(c.env.DB, 'SELECT COUNT(*) AS n FROM record_documents WHERE record_code = ?', record.code);
        count = Number(r?.n || 0);
      }
    } else if (record.count) {
      const r = await dbGet(c.env.DB, record.count.replace('{scope}', scope.clause), ...scope.params);
      count = Number(r?.n || 0);
    }
    rows.push({
      code: record.code,
      name: record.name,
      form: record.form,
      kind: record.kind,
      retains: record.retains,
      where: record.where || null,
      href: record.href || (record.kind === 'document' ? `/records/${record.code}` : null),
      count,
    });
  }
  return c.json(rows);
});

// ---- R-LAB-101 / R-LAB-102: filed documents ----

const DOCUMENT_SELECT = `
  SELECT d.id, d.record_code, d.department_id, d.title, d.period_label, d.document_date, d.notes,
    d.file_key, d.file_content_type, d.file_uploaded_at, d.created_at,
    dep.name AS department_name, u.full_name AS file_uploaded_by_name, cu.full_name AS created_by_name
  FROM record_documents d
  LEFT JOIN departments dep ON dep.id = d.department_id
  LEFT JOIN users u ON u.id = d.file_uploaded_by
  LEFT JOIN users cu ON cu.id = d.created_by
`;

records.get('/:code/documents', async (c) => {
  const user = c.get('user');
  const code = c.req.param('code');
  if (!DOCUMENT_CODES.includes(code)) return c.json({ error: 'Not a filed-document record' }, 404);
  if (!canReadDocuments(user)) return c.json({ error: 'You do not have access to these records' }, 403);

  const rows = await dbAll(
    c.env.DB,
    DOCUMENT_SELECT + ' WHERE d.record_code = ? ORDER BY COALESCE(d.document_date, d.created_at) DESC, d.id DESC',
    code
  );
  return c.json({ ...findRecordCode(code), items: rows });
});

records.post('/:code/documents', async (c) => {
  const user = c.get('user');
  const code = c.req.param('code');
  if (!DOCUMENT_CODES.includes(code)) return c.json({ error: 'Not a filed-document record' }, 404);
  if (!canWriteDocuments(user)) return c.json({ error: 'Only an admin can file this record' }, 403);

  const { title, period_label, document_date, notes, department_id } = await c.req.json().catch(() => ({}));
  if (!title?.trim()) return c.json({ error: 'A title is required' }, 400);

  const result = await dbRun(
    c.env.DB,
    `INSERT INTO record_documents (record_code, department_id, title, period_label, document_date, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    code,
    department_id || null,
    title.trim(),
    period_label?.trim() || null,
    document_date || null,
    notes?.trim() || null,
    user.id
  );
  return c.json(await dbGet(c.env.DB, DOCUMENT_SELECT + ' WHERE d.id = ?', result.lastInsertRowid), 201);
});

records.put('/:code/documents/:id', async (c) => {
  const user = c.get('user');
  if (!canWriteDocuments(user)) return c.json({ error: 'Only an admin can edit this record' }, 403);
  const existing = await dbGet(c.env.DB, DOCUMENT_SELECT + ' WHERE d.id = ?', c.req.param('id'));
  if (!existing) return c.json({ error: 'Record not found' }, 404);

  const { title, period_label, document_date, notes, department_id } = await c.req.json().catch(() => ({}));
  await dbRun(
    c.env.DB,
    `UPDATE record_documents SET title = ?, period_label = ?, document_date = ?, notes = ?, department_id = ?
     WHERE id = ?`,
    title?.trim() || existing.title,
    period_label?.trim() ?? existing.period_label,
    document_date ?? existing.document_date,
    notes?.trim() ?? existing.notes,
    department_id === undefined ? existing.department_id : department_id || null,
    existing.id
  );
  return c.json(await dbGet(c.env.DB, DOCUMENT_SELECT + ' WHERE d.id = ?', existing.id));
});

records.delete('/:code/documents/:id', async (c) => {
  const user = c.get('user');
  if (!canWriteDocuments(user)) return c.json({ error: 'Only an admin can remove this record' }, 403);
  const existing = await dbGet(c.env.DB, 'SELECT id FROM record_documents WHERE id = ?', c.req.param('id'));
  if (!existing) return c.json({ error: 'Record not found' }, 404);
  await dbRun(c.env.DB, 'DELETE FROM record_documents WHERE id = ?', existing.id);
  return c.body(null, 204);
});

// The approved document itself. Same attachment mechanism the signed
// hardcopies on F-LAB-007/009 use -- a BLOB in D1, since no object storage
// is attached to this account -- pointed at this table's file_* columns.
const documentFiles = new Hono();
documentFiles.use('*', requireAuth);
addSignedCopyRoutes(documentFiles, {
  table: 'record_documents',
  columnPrefix: 'file',
  route: 'file',
  keyPrefix: 'record',
  getRow: (db, id) => dbGet(db, DOCUMENT_SELECT + ' WHERE d.id = ?', id),
  userCanAccessRow: (user) => canReadDocuments(user),
  canWrite: (user) => canWriteDocuments(user),
});
records.route('/documents', documentFiles);

export default records;

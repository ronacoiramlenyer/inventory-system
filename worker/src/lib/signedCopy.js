import { dbRun } from '../db/helpers.js';

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const MAX_BYTES = 10 * 1024 * 1024;

// Adds POST/GET/DELETE /:id/signed-copy routes to `router`, for a table
// that has signed_copy_key/signed_copy_uploaded_by/signed_copy_uploaded_at
// columns. Shared by Borrowing Requests (F-LAB-007) and Incident Reports
// (F-LAB-009) -- both are hardcopy/digital hybrids where the actual
// signature (borrower's, or the involved parties') is wet-ink on a printed
// copy, not anything captured on screen, so custodians attach a photo/scan
// of that signed copy here as the real record alongside the digital one.
export function addSignedCopyRoutes(router, { table, getRow, keyPrefix, userCanAccessRow }) {
  router.post('/:id/signed-copy', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const row = await getRow(c.env.DB, id);
    if (!row) return c.json({ error: 'Not found' }, 404);
    if (!userCanAccessRow(user, row)) {
      return c.json({ error: 'You do not have access to this record' }, 403);
    }
    if (!c.env.ATTACHMENTS) {
      return c.json({ error: 'File storage is not configured on this deployment' }, 501);
    }

    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file === 'string') {
      return c.json({ error: 'file is required' }, 400);
    }
    const ext = EXT_BY_TYPE[file.type];
    if (!ext) {
      return c.json({ error: 'Only JPG, PNG, WEBP, or PDF files are allowed' }, 400);
    }
    if (file.size > MAX_BYTES) {
      return c.json({ error: 'File is too large (max 10MB)' }, 400);
    }

    const key = `${keyPrefix}/${id}-${Date.now()}.${ext}`;
    await c.env.ATTACHMENTS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    if (row.signed_copy_key) {
      await c.env.ATTACHMENTS.delete(row.signed_copy_key).catch(() => {});
    }

    const uploadedAt = new Date().toISOString();
    await dbRun(
      c.env.DB,
      `UPDATE ${table} SET signed_copy_key = ?, signed_copy_uploaded_by = ?, signed_copy_uploaded_at = ? WHERE id = ?`,
      key,
      user.id,
      uploadedAt,
      id
    );
    return c.json({ signed_copy_key: key, signed_copy_uploaded_at: uploadedAt, signed_copy_uploaded_by_name: user.full_name });
  });

  router.get('/:id/signed-copy', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const row = await getRow(c.env.DB, id);
    if (!row) return c.json({ error: 'Not found' }, 404);
    if (!userCanAccessRow(user, row)) {
      return c.json({ error: 'You do not have access to this record' }, 403);
    }
    if (!row.signed_copy_key) return c.json({ error: 'No signed copy attached' }, 404);
    if (!c.env.ATTACHMENTS) {
      return c.json({ error: 'File storage is not configured on this deployment' }, 501);
    }

    const obj = await c.env.ATTACHMENTS.get(row.signed_copy_key);
    if (!obj) return c.json({ error: 'File not found in storage' }, 404);
    return new Response(obj.body, {
      headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream' },
    });
  });

  router.delete('/:id/signed-copy', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const row = await getRow(c.env.DB, id);
    if (!row) return c.json({ error: 'Not found' }, 404);
    if (!userCanAccessRow(user, row)) {
      return c.json({ error: 'You do not have access to this record' }, 403);
    }
    if (row.signed_copy_key && c.env.ATTACHMENTS) {
      await c.env.ATTACHMENTS.delete(row.signed_copy_key).catch(() => {});
    }
    await dbRun(
      c.env.DB,
      `UPDATE ${table} SET signed_copy_key = NULL, signed_copy_uploaded_by = NULL, signed_copy_uploaded_at = NULL WHERE id = ?`,
      id
    );
    return c.body(null, 204);
  });
}

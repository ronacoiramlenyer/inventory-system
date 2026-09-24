import { dbGet, dbRun } from '../db/helpers.js';

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
// D1 caps a single row (all its BLOB/string columns combined) at 2,000,000
// bytes -- capped well under that so the rest of the row and any bind
// overhead always fits safely.
const MAX_BYTES = 1.5 * 1024 * 1024;

// Adds POST/GET/DELETE /:id/signed-copy routes to `router`, for a table
// that has signed_copy_key/signed_copy_data/signed_copy_content_type/
// signed_copy_uploaded_by/signed_copy_uploaded_at columns. Shared by
// Borrowing Requests (F-LAB-007) and Incident Reports (F-LAB-009) -- both
// are hardcopy/digital hybrids where the actual signature (borrower's, or
// the involved parties') is wet-ink on a printed copy, not anything
// captured on screen, so custodians attach a photo/scan of that signed
// copy here as the real record alongside the digital one.
//
// The file itself is stored as a BLOB directly in D1 rather than in
// object storage (R2), since R2 isn't enabled on this Cloudflare account.
// `getRow`'s query must NOT select signed_copy_data -- it's fetched
// separately, only by the GET route, so an ordinary list/detail fetch of
// the table never pulls image bytes along with it.
//
// `columnPrefix` names the column family and the route segment, so the same
// mechanism serves the CAPEX/OPEX documents filed under R-LAB-101/102, where
// the attachment is the record itself rather than a signature on one.
export function addSignedCopyRoutes(
  router,
  { table, getRow, keyPrefix, userCanAccessRow, columnPrefix = 'signed_copy', route = 'signed-copy', canWrite = () => true }
) {
  const col = {
    key: `${columnPrefix}_key`,
    data: `${columnPrefix}_data`,
    type: `${columnPrefix}_content_type`,
    by: `${columnPrefix}_uploaded_by`,
    at: `${columnPrefix}_uploaded_at`,
  };
  router.post(`/:id/${route}`, async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const row = await getRow(c.env.DB, id);
    if (!row) return c.json({ error: 'Not found' }, 404);
    if (!userCanAccessRow(user, row) || !canWrite(user, row)) {
      return c.json({ error: 'You do not have access to this record' }, 403);
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
      return c.json({ error: 'File is too large (max 1.5MB) -- try a lower-resolution photo' }, 400);
    }

    const bytes = await file.arrayBuffer();
    const label = `${keyPrefix}-${id}-${Date.now()}.${ext}`;
    const uploadedAt = new Date().toISOString();
    await dbRun(
      c.env.DB,
      `UPDATE ${table} SET ${col.key} = ?, ${col.data} = ?, ${col.type} = ?,
         ${col.by} = ?, ${col.at} = ? WHERE id = ?`,
      label,
      bytes,
      file.type,
      user.id,
      uploadedAt,
      id
    );
    return c.json({ [col.key]: label, [col.at]: uploadedAt, uploaded_by_name: user.full_name });
  });

  router.get(`/:id/${route}`, async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const row = await getRow(c.env.DB, id);
    if (!row) return c.json({ error: 'Not found' }, 404);
    if (!userCanAccessRow(user, row)) {
      return c.json({ error: 'You do not have access to this record' }, 403);
    }
    if (!row[col.key]) return c.json({ error: 'Nothing attached' }, 404);

    const blobRow = await dbGet(c.env.DB, `SELECT ${col.data}, ${col.type} FROM ${table} WHERE id = ?`, id);
    if (!blobRow?.[col.data]) return c.json({ error: 'Nothing attached' }, 404);
    // D1 doesn't hand a BLOB column back as a real ArrayBuffer/TypedArray --
    // wrapping it explicitly avoids Response() silently stringifying it
    // (e.g. as comma-joined byte values) instead of sending raw bytes.
    return new Response(new Uint8Array(blobRow[col.data]), {
      headers: { 'Content-Type': blobRow[col.type] || 'application/octet-stream' },
    });
  });

  router.delete(`/:id/${route}`, async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const row = await getRow(c.env.DB, id);
    if (!row) return c.json({ error: 'Not found' }, 404);
    if (!userCanAccessRow(user, row) || !canWrite(user, row)) {
      return c.json({ error: 'You do not have access to this record' }, 403);
    }
    await dbRun(
      c.env.DB,
      `UPDATE ${table} SET ${col.key} = NULL, ${col.data} = NULL, ${col.type} = NULL,
         ${col.by} = NULL, ${col.at} = NULL WHERE id = ?`,
      id
    );
    return c.body(null, 204);
  });
}

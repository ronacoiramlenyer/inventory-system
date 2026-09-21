import { dbGet, dbRun } from '../db/helpers.js';

// Auto-creates an F-LAB-001 log entry when a PMS/ECS/EWR is marked Completed.
//
// The entry belongs on the physical unit that was serviced, so the request's
// serial number is resolved against that item's units. Until the request
// forms reference a unit directly, a request with no serial (or one that
// doesn't match) still records the work against the item with
// equipment_record_id left NULL, rather than being dropped.
export async function logEquipmentService(
  db,
  { equipmentItemId, serialNumber, entryDate, servicePerformed, requestId, loggedBy, createdBy }
) {
  if (!equipmentItemId || !entryDate) return;

  let unitId = null;
  const serial = serialNumber?.trim();
  if (serial) {
    const unit = await dbGet(
      db,
      'SELECT id FROM equipment_records WHERE item_id = ? AND serial_number = ? COLLATE NOCASE',
      equipmentItemId,
      serial
    );
    unitId = unit?.id ?? null;
  }

  await dbRun(
    db,
    `INSERT INTO equipment_logs (equipment_id, equipment_record_id, entry_date, service_performed, request_id, status, logged_by, created_by)
     VALUES (?, ?, ?, ?, ?, 'Completed', ?, ?)`,
    equipmentItemId,
    unitId,
    entryDate,
    servicePerformed || 'Repair',
    requestId || null,
    loggedBy,
    createdBy
  );
}

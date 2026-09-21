import { dbRun } from '../db/helpers.js';

// Auto-creates an F-LAB-001 log entry when a PMS/ECS/EWR is marked Completed.
//
// The entry lands on the individual unit the request names, so the work shows
// up in that unit's 201 file and nowhere else. A request raised before units
// existed carries no unit and still records against the item, with
// equipment_record_id left NULL, rather than being dropped.
export async function logEquipmentService(
  db,
  { equipmentItemId, equipmentRecordId, entryDate, servicePerformed, requestId, loggedBy, createdBy }
) {
  if (!equipmentItemId || !entryDate) return;

  await dbRun(
    db,
    `INSERT INTO equipment_logs (equipment_id, equipment_record_id, entry_date, service_performed, request_id, status, logged_by, created_by)
     VALUES (?, ?, ?, ?, ?, 'Completed', ?, ?)`,
    equipmentItemId,
    equipmentRecordId || null,
    entryDate,
    servicePerformed || 'Repair',
    requestId || null,
    loggedBy,
    createdBy
  );
}

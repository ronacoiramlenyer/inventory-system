import { dbRun } from '../db/helpers.js';

// Auto-creates an F-LAB-001 Equipment Monitoring Record log entry when a
// piece of equipment picked from Inventory has work completed against it
// elsewhere in the system -- a PMS/ECS schedule row (F-LAB-002/003) getting
// its Actual Date filled in, or an Equipment Work Request (F-LAB-004)
// getting marked Completed. Without this, F-LAB-001 stayed empty even for
// equipment with a full schedule/work-request history, since those forms
// only ever referenced the equipment by name, not by a real link to it.
export async function logEquipmentService(db, { equipmentItemId, entryDate, servicePerformed, requestId, loggedBy, createdBy }) {
  if (!equipmentItemId || !entryDate) return;
  await dbRun(
    db,
    `INSERT INTO equipment_logs (equipment_id, entry_date, service_performed, request_id, status, logged_by, created_by)
     VALUES (?, ?, ?, ?, 'Completed', ?, ?)`,
    equipmentItemId,
    entryDate,
    servicePerformed || 'Repair',
    requestId || null,
    loggedBy,
    createdBy
  );
}

import { dbRun } from '../db/helpers.js';

// Auto-creates an F-LAB-001 Equipment Monitoring Record log entry when a
// specific equipment unit (with serial number) completes a maintenance task.
// Called when a PMS/ECS/EWR transitions to completed status.
export async function logEquipmentService(db, { equipmentRecordId, entryDate, servicePerformed, requestId, loggedBy, createdBy }) {
  if (!equipmentRecordId || !entryDate) return;
  await dbRun(
    db,
    `INSERT INTO equipment_logs (equipment_record_id, entry_date, service_performed, request_id, status, logged_by, created_by)
     VALUES (?, ?, ?, ?, 'Completed', ?, ?)`,
    equipmentRecordId,
    entryDate,
    servicePerformed || 'Repair',
    requestId || null,
    loggedBy,
    createdBy
  );
}

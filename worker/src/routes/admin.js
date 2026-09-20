import { Hono } from 'hono';
import { dbRun } from '../db/helpers.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const admin = new Hono();
admin.use('*', requireAuth, requireAdmin);

admin.post('/purge-inventory', async (c) => {
  try {
    const db = c.env.DB;

    // Delete in order, respecting foreign key constraints
    // Forms and requests that reference items
    await dbRun(db, 'DELETE FROM borrowing_request_items');
    await dbRun(db, 'DELETE FROM borrowing_requests');
    await dbRun(db, 'DELETE FROM work_requests');
    await dbRun(db, 'DELETE FROM maintenance_schedule_items');
    await dbRun(db, 'DELETE FROM calibration_schedule_items');

    // Standalone lab records
    await dbRun(db, 'DELETE FROM incident_reports');
    await dbRun(db, 'DELETE FROM waste_disposal_logs');
    await dbRun(db, 'DELETE FROM bookstore_requisitions');
    await dbRun(db, 'DELETE FROM supplies_requisitions');
    await dbRun(db, 'DELETE FROM bgu_job_requests');

    // Equipment service history
    await dbRun(db, 'DELETE FROM equipment_logs');
    await dbRun(db, 'DELETE FROM equipment_instances');

    // Inventory sheets
    await dbRun(db, 'DELETE FROM inventory_count_items');
    await dbRun(db, 'DELETE FROM inventory_counts');
    await dbRun(db, 'DELETE FROM transactions');
    await dbRun(db, 'DELETE FROM items');

    // Reset ID sequences
    await dbRun(
      db,
      `DELETE FROM sqlite_sequence WHERE name IN (
        'items',
        'transactions',
        'inventory_counts',
        'inventory_count_items',
        'equipment_instances',
        'equipment_logs',
        'work_requests',
        'maintenance_schedule_items',
        'calibration_schedule_items',
        'borrowing_requests',
        'borrowing_request_items',
        'incident_reports',
        'waste_disposal_logs',
        'bookstore_requisitions',
        'supplies_requisitions',
        'bgu_job_requests'
      )`
    );

    return c.json({
      success: true,
      message: 'Inventory data purged successfully. Users, departments, and labs preserved.',
    });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

export default admin;

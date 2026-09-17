import { Hono } from 'hono';
import { cors } from 'hono/cors';

import authRoutes from './routes/auth.js';
import departmentsRoutes from './routes/departments.js';
import usersRoutes from './routes/users.js';
import laboratoriesRoutes from './routes/laboratories.js';
import itemsRoutes from './routes/items.js';
import transactionsRoutes from './routes/transactions.js';
import dashboardRoutes from './routes/dashboard.js';
import inventoryCountsRoutes from './routes/inventory-counts.js';
import equipmentRoutes from './routes/equipment.js';
import { maintenanceScheduleRoutes, calibrationScheduleRoutes } from './routes/schedules.js';
import workRequestsRoutes from './routes/work-requests.js';
import borrowingRequestsRoutes from './routes/borrowing-requests.js';
import wasteDisposalLogRoutes from './routes/waste-disposal-log.js';
import incidentReportsRoutes from './routes/incident-reports.js';
import { bookstoreRequisitionRoutes, suppliesRequisitionRoutes } from './routes/requisitions.js';
import bguJobRequestsRoutes from './routes/bgu-job-requests.js';

const app = new Hono();

app.use('/api/*', cors());

app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.route('/api/auth', authRoutes);
app.route('/api/departments', departmentsRoutes);
app.route('/api/users', usersRoutes);
app.route('/api/laboratories', laboratoriesRoutes);
app.route('/api/items', itemsRoutes);
app.route('/api', transactionsRoutes); // /api/items/:itemId/stock-card, /api/items/:itemId/transactions, /api/transactions/:id
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/inventory-counts', inventoryCountsRoutes);
app.route('/api/equipment', equipmentRoutes);
app.route('/api/maintenance-schedule', maintenanceScheduleRoutes);
app.route('/api/calibration-schedule', calibrationScheduleRoutes);
app.route('/api/work-requests', workRequestsRoutes);
app.route('/api/borrowing-requests', borrowingRequestsRoutes);
app.route('/api/waste-disposal-log', wasteDisposalLogRoutes);
app.route('/api/incident-reports', incidentReportsRoutes);
app.route('/api/bookstore-requisitions', bookstoreRequisitionRoutes);
app.route('/api/supplies-requisitions', suppliesRequisitionRoutes);
app.route('/api/bgu-job-requests', bguJobRequestsRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;

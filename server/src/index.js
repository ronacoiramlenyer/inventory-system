import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import departmentsRoutes from './routes/departments.js';
import usersRoutes from './routes/users.js';
import laboratoriesRoutes from './routes/laboratories.js';
import itemsRoutes from './routes/items.js';
import transactionsRoutes from './routes/transactions.js';
import dashboardRoutes from './routes/dashboard.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/laboratories', laboratoriesRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api', transactionsRoutes); // /api/items/:itemId/stock-card, /api/items/:itemId/transactions, /api/transactions/:id
app.use('/api/dashboard', dashboardRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Inventory API listening on http://localhost:${PORT}`);
});

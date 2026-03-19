import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import revenueRoutes from './routes/revenue.js';
import shiftsRoutes from './routes/shifts.js';
import computersRoutes from './routes/computers.js';
import workersRoutes from './routes/workers.js';
import clientsRoutes from './routes/clients.js';
import bookingsRoutes from './routes/bookings.js';
import eventsRoutes from './routes/events.js';
import discountsRoutes from './routes/discounts.js';
import packagesRoutes from './routes/packages.js';
import db from './db/init.js';
import { startSimulation } from './simulation.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/revenue', revenueRoutes);
app.use('/api/shifts', shiftsRoutes);
app.use('/api/computers', computersRoutes);
app.use('/api/workers', workersRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/discounts', discountsRoutes);
app.use('/api/packages', packagesRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
  startSimulation(db);
});

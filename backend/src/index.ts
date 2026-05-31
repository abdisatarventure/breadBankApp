import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db';
import { requireAuth } from './middleware/auth';
import dashboardRouter   from './routes/dashboard';
import transactionsRouter from './routes/transactions';
import uploadRouter      from './routes/upload';
import categoriesRouter  from './routes/categories';
import accountsRouter    from './routes/accounts';
import aiRouter          from './routes/ai';
import authRouter        from './routes/auth';

dotenv.config();

const app  = express();
const PORT = process.env.PORT ?? 3000;

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:9000'];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Public routes — no auth required
app.use('/api/auth', authRouter);

// Protected routes — valid JWT required
app.use('/api/dashboard',    requireAuth, dashboardRouter);
app.use('/api/transactions', requireAuth, transactionsRouter);
app.use('/api/upload',       requireAuth, uploadRouter);
app.use('/api/categories',   requireAuth, categoriesRouter);
app.use('/api/accounts',     requireAuth, accountsRouter);
app.use('/api/ai',           requireAuth, aiRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`BreadBank API running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db';
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

app.use(cors({ origin: 'http://localhost:9000' }));
app.use(express.json());

app.use('/api/dashboard',    dashboardRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/upload',       uploadRouter);
app.use('/api/categories',   categoriesRouter);
app.use('/api/accounts',     accountsRouter);
app.use('/api/auth',         authRouter);
app.use('/api/ai',           aiRouter);

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

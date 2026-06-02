import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectDB } from './config/db';
import { requireAuth } from './middleware/auth';
import dashboardRouter   from './routes/dashboard';
import reportsRouter     from './routes/reports';
import transactionsRouter from './routes/transactions';
import uploadRouter      from './routes/upload';
import categoriesRouter  from './routes/categories';
import subscriptionsRouter from './routes/subscriptions';
import accountsRouter    from './routes/accounts';
import aiRouter          from './routes/ai';
import authRouter        from './routes/auth';
import plaidRouter       from './routes/plaid';
import budgetsRouter     from './routes/budgets';

dotenv.config();

const app  = express();
const PORT = Number(process.env.PORT ?? 3000);
let server: http.Server | null = null;

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:9000'];

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));

// Brute-force / credential-stuffing protection on auth, plus a generous
// catch-all so a single client can't hammer the API.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Public routes — no auth required
app.use('/api/auth', authLimiter, authRouter);

// Protected routes — valid JWT required
app.use('/api/dashboard',    requireAuth, dashboardRouter);
app.use('/api/reports',      requireAuth, reportsRouter);
app.use('/api/transactions', requireAuth, transactionsRouter);
app.use('/api/upload',       requireAuth, uploadRouter);
app.use('/api/categories',   requireAuth, categoriesRouter);
app.use('/api/subscriptions', requireAuth, subscriptionsRouter);
app.use('/api/accounts',     requireAuth, accountsRouter);
app.use('/api/ai',           requireAuth, aiRouter);
app.use('/api/plaid',        requireAuth, plaidRouter);
app.use('/api/budgets',      requireAuth, budgetsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function start() {
  await connectDB();

  server = app.listen(PORT, () => {
    console.log(`BreadBank API running on http://localhost:${PORT}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Make sure no other server is running on that port.`);
      process.exit(1);
    }
    console.error('Server error:', error);
    process.exit(1);
  });
}

function shutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down server...`);
  if (!server) {
    process.exit(0);
    return;
  }

  server.close(error => {
    if (error) {
      console.error('Error closing server:', error);
      process.exit(1);
      return;
    }
    console.log('Server closed successfully.');
    process.exit(0);
  });

  setTimeout(() => {
    console.warn('Shutdown timeout reached. Forcing exit.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGUSR2', () => {
  shutdown('SIGUSR2');
  process.kill(process.pid, 'SIGUSR2');
});
process.on('unhandledRejection', reason => {
  console.error('Unhandled rejection:', reason);
  shutdown('unhandledRejection');
});
process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
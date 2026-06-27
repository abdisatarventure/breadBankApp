import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DB_PASSWORD) {
  throw new Error('DB_PASSWORD env var is required — set it in backend/.env (see .env.example).');
}

const config: sql.config = {
  server: process.env.DB_SERVER ?? 'localhost',
  database: process.env.DB_NAME ?? 'breadbank',
  user: process.env.DB_USER ?? 'breadbank_user',
  password: process.env.DB_PASSWORD,
  options: {
    // Named instance (e.g. SQLEXPRESS). Set DB_INSTANCE='' for a default instance.
    instanceName: process.env.DB_INSTANCE ?? 'SQLEXPRESS',
    trustServerCertificate: true,
    encrypt: false,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool: sql.ConnectionPool | null = null;

export async function connectDB(): Promise<void> {
  pool = await sql.connect(config);

  // A pooled connection dropping (SQL Server restart, network blip) makes the
  // ConnectionPool emit 'error'. An EventEmitter 'error' with no listener is
  // rethrown by Node → uncaughtException → the process exits. For a 24/7 service
  // that's an avoidable crash: log it and let the pool re-establish connections
  // on the next request (min:0 means broken idle connections just get replaced).
  pool.on('error', err => {
    console.error('SQL Server pool error (will reconnect on next query):', err);
  });

  console.log('✓ Connected to SQL Server (breadbank)');
}

export function getPool(): sql.ConnectionPool {
  if (!pool) throw new Error('Database not connected — call connectDB() first');
  return pool;
}

export { sql };

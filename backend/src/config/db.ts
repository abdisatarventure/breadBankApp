import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DB_PASSWORD) {
  throw new Error('DB_PASSWORD env var is required — set it in backend/.env (see .env.example).');
}

const config: sql.config = {
  server: 'localhost',
  database: process.env.DB_NAME ?? 'breadbank',
  user: process.env.DB_USER ?? 'breadbank_user',
  password: process.env.DB_PASSWORD,
  options: {
    instanceName: 'SQLEXPRESS',
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
  console.log('✓ Connected to SQL Server (breadbank)');
}

export function getPool(): sql.ConnectionPool {
  if (!pool) throw new Error('Database not connected — call connectDB() first');
  return pool;
}

export { sql };

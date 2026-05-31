import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { getPool, sql } from '../config/db';

dotenv.config();

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'breadbank_dev_secret';
const JWT_EXPIRES = '8h';

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body as { email?: string; password?: string; name?: string };
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedEmail || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const pool = getPool();
    const existing = await pool.request()
      .input('email', sql.NVarChar(200), normalizedEmail)
      .query('SELECT id FROM users WHERE email = @email');

    if (existing.recordset.length > 0) {
      res.status(409).json({ error: 'Email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.request()
      .input('email', sql.NVarChar(200), normalizedEmail)
      .input('passwordHash', sql.NVarChar(200), passwordHash)
      .input('name', sql.NVarChar(100), name?.trim() ?? null)
      .query(`
        INSERT INTO users (email, password, name)
        OUTPUT INSERTED.id, INSERTED.email, INSERTED.name
        VALUES (@email, @passwordHash, @name)
      `);

    const user = result.recordset[0];
    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    console.error('Auth register error:', err);
    res.status(500).json({ error: 'Failed to register user.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedEmail || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const pool = getPool();
    const result = await pool.request()
      .input('email', sql.NVarChar(200), normalizedEmail)
      .query('SELECT id, email, password AS passwordHash, name FROM users WHERE email = @email');

    const user = result.recordset[0] as { id: number; email: string; passwordHash: string; name: string | null } | undefined;

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error('Auth login error:', err);
    res.status(500).json({ error: 'Failed to authenticate user.' });
  }
});

export default router;

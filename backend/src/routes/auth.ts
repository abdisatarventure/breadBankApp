import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getPool, sql } from '../config/db';
import { JWT_SECRET, JWT_EXPIRES } from '../config/auth';
import { requireAuth, AuthRequest } from '../middleware/auth';
import type { ConnectionPool } from 'mssql';

const router = Router();
const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_COST = 12;

// The starter accounts every new user gets their own private copy of. Each user's
// balances/transactions are scoped to these, so no data is shared between users.
const DEFAULT_ACCOUNTS: [name: string, type: string, institution: string][] = [
  ['Checking',      'checking',   'Wells Fargo'],
  ['Savings',       'savings',    'Wells Fargo'],
  ['Apple Card',    'credit',     'Apple'],
  ['Discover Card', 'credit',     'Discover'],
  ['Robinhood',     'investment', 'Robinhood'],
  ['Fidelity',      'investment', 'Fidelity'],
];

async function seedDefaultAccounts(pool: ConnectionPool, userId: number): Promise<void> {
  for (const [name, type, institution] of DEFAULT_ACCOUNTS) {
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar(100), name)
      .input('type', sql.NVarChar(50), type)
      .input('institution', sql.NVarChar(100), institution)
      .query(`INSERT INTO accounts (user_id, name, type, institution)
              VALUES (@userId, @name, @type, @institution)`);
  }
}

// Security-question answers are matched case/whitespace-insensitively so a user
// isn't locked out by capitalization. They're bcrypt-hashed, never stored plain.
function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, ' ');
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, securityQuestion, securityAnswer } = req.body as {
      email?: string; password?: string; name?: string;
      securityQuestion?: string; securityAnswer?: string;
    };
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedEmail || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH || password.length > 72) {
      res.status(400).json({ error: `Password must be between ${MIN_PASSWORD_LENGTH} and 72 characters.` });
      return;
    }

    const question = typeof securityQuestion === 'string' ? securityQuestion.trim() : '';
    const answer   = typeof securityAnswer === 'string' ? securityAnswer.trim() : '';
    if ((question && !answer) || (!question && answer)) {
      res.status(400).json({ error: 'A security question needs both a question and an answer.' });
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

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const answerHash   = answer ? await bcrypt.hash(normalizeAnswer(answer), BCRYPT_COST) : null;
    const result = await pool.request()
      .input('email', sql.NVarChar(200), normalizedEmail)
      .input('passwordHash', sql.NVarChar(200), passwordHash)
      .input('name', sql.NVarChar(100), name?.trim() ?? null)
      .input('question', sql.NVarChar(300), question || null)
      .input('answerHash', sql.NVarChar(200), answerHash)
      .query(`
        INSERT INTO users (email, password, name, security_question, security_answer)
        OUTPUT INSERTED.id, INSERTED.email, INSERTED.name
        VALUES (@email, @passwordHash, @name, @question, @answerHash)
      `);

    const user = result.recordset[0];
    await seedDefaultAccounts(pool, user.id);
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

// ── Password reset via security question (no email server needed) ──────

// Step 1: look up the question to show the user. Returns 404 if the account has
// no security question set (then reset isn't available — use the Settings page or
// the CLI to set one).
router.post('/forgot/question', async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalizedEmail) {
      res.status(400).json({ error: 'Email is required.' });
      return;
    }

    const result = await getPool().request()
      .input('email', sql.NVarChar(200), normalizedEmail)
      .query('SELECT security_question FROM users WHERE email = @email');

    const question = (result.recordset[0] as { security_question: string | null } | undefined)?.security_question;
    if (!question) {
      res.status(404).json({ error: 'No security question is set for that account.' });
      return;
    }
    res.json({ question });
  } catch (err) {
    console.error('Forgot question error:', err);
    res.status(500).json({ error: 'Failed to look up security question.' });
  }
});

// Step 2: verify the answer and set a new password.
router.post('/forgot/reset', async (req, res) => {
  try {
    const { email, answer, newPassword } = req.body as { email?: string; answer?: string; newPassword?: string };
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedEmail || !answer || !newPassword) {
      res.status(400).json({ error: 'Email, answer, and a new password are required.' });
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > 72) {
      res.status(400).json({ error: `Password must be between ${MIN_PASSWORD_LENGTH} and 72 characters.` });
      return;
    }

    const pool = getPool();
    const result = await pool.request()
      .input('email', sql.NVarChar(200), normalizedEmail)
      .query('SELECT id, security_answer FROM users WHERE email = @email');

    const user = result.recordset[0] as { id: number; security_answer: string | null } | undefined;
    if (!user || !user.security_answer) {
      res.status(400).json({ error: 'Could not reset password. Check the email and try again.' });
      return;
    }

    const answerMatches = await bcrypt.compare(normalizeAnswer(answer), user.security_answer);
    if (!answerMatches) {
      res.status(401).json({ error: 'That answer is incorrect.' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await pool.request()
      .input('id', sql.Int, user.id)
      .input('passwordHash', sql.NVarChar(200), passwordHash)
      .query('UPDATE users SET password = @passwordHash WHERE id = @id');

    res.json({ ok: true });
  } catch (err) {
    console.error('Forgot reset error:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// ── Manage your own security question (logged in, from Settings) ───────

router.get('/me/security', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await getPool().request()
      .input('id', sql.Int, req.userId)
      .query('SELECT security_question FROM users WHERE id = @id');
    const question = (result.recordset[0] as { security_question: string | null } | undefined)?.security_question ?? null;
    res.json({ hasSecurityQuestion: Boolean(question), question });
  } catch (err) {
    console.error('Get security error:', err);
    res.status(500).json({ error: 'Failed to load security question.' });
  }
});

router.put('/me/security', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, question, answer } = req.body as {
      currentPassword?: string; question?: string; answer?: string;
    };
    const q = typeof question === 'string' ? question.trim() : '';
    const a = typeof answer === 'string' ? answer.trim() : '';
    if (!currentPassword || !q || !a) {
      res.status(400).json({ error: 'Current password, a question, and an answer are all required.' });
      return;
    }

    const pool = getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.userId)
      .query('SELECT password AS passwordHash FROM users WHERE id = @id');
    const row = result.recordset[0] as { passwordHash: string } | undefined;
    if (!row || !(await bcrypt.compare(currentPassword, row.passwordHash))) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const answerHash = await bcrypt.hash(normalizeAnswer(a), BCRYPT_COST);
    await pool.request()
      .input('id', sql.Int, req.userId)
      .input('question', sql.NVarChar(300), q)
      .input('answerHash', sql.NVarChar(200), answerHash)
      .query('UPDATE users SET security_question = @question, security_answer = @answerHash WHERE id = @id');

    res.json({ hasSecurityQuestion: true, question: q });
  } catch (err) {
    console.error('Set security error:', err);
    res.status(500).json({ error: 'Failed to update security question.' });
  }
});

export default router;

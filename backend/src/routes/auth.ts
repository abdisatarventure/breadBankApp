import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getPool, sql } from '../config/db';
import { JWT_SECRET, JWT_EXPIRES } from '../config/auth';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { plaid } from '../config/plaid';
import { decryptSecret } from '../config/crypto';
import type { ConnectionPool } from 'mssql';

const router = Router();
const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_COST = 12;
// The showcase account the one-click "Demo" login drops anyone into.
const DEMO_EMAIL = 'test@gmail.com';
// Version of the Privacy Policy / consent text in effect. Bump when the policy
// materially changes so we can tell who accepted which version.
const CONSENT_VERSION = '1.0';

// The starter accounts every new user gets their own private copy of. Kept
// GENERIC (no bank branding) so a new user isn't greeted by someone else's
// bank lineup: the first Plaid link of a matching type adopts + renames the
// starter, and unused ones can be hidden from the Upload page.
const DEFAULT_ACCOUNTS: [name: string, type: string, institution: string][] = [
  ['Checking',    'checking', 'My Bank'],
  ['Savings',     'savings',  'My Bank'],
  ['Credit Card', 'credit',   'My Card'],
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
    const { email, password, name, securityQuestion, securityAnswer, consentAccepted } = req.body as {
      email?: string; password?: string; name?: string;
      securityQuestion?: string; securityAnswer?: string; consentAccepted?: boolean;
    };
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedEmail || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    // Explicit, recorded consent to the Privacy Policy is required before we
    // collect or process any of the user's financial data (see CONSENT_VERSION).
    if (consentAccepted !== true) {
      res.status(400).json({ error: 'You must accept the Privacy Policy to create an account.' });
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
    // The live users.name column is NOT NULL; when no display name is given,
    // fall back to the email's local part rather than failing the insert.
    const displayName = (typeof name === 'string' && name.trim()) || normalizedEmail.split('@')[0] || 'User';
    const result = await pool.request()
      .input('email', sql.NVarChar(200), normalizedEmail)
      .input('passwordHash', sql.NVarChar(200), passwordHash)
      .input('name', sql.NVarChar(100), displayName)
      .input('question', sql.NVarChar(300), question || null)
      .input('answerHash', sql.NVarChar(200), answerHash)
      .input('consentVersion', sql.NVarChar(20), CONSENT_VERSION)
      .query(`
        INSERT INTO users (email, password, name, security_question, security_answer, consent_at, consent_version)
        OUTPUT INSERTED.id, INSERTED.email, INSERTED.name
        VALUES (@email, @passwordHash, @name, @question, @answerHash, SYSUTCDATETIME(), @consentVersion)
      `);

    const user = result.recordset[0];
    await seedDefaultAccounts(pool, user.id);
    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    // Unique-constraint violation on users.email: two simultaneous registrations
    // slipped past the SELECT check above. Answer like the normal duplicate path
    // instead of a 500. (2627 = unique constraint, 2601 = unique index)
    const sqlErrNo = (err as { number?: number }).number;
    if (sqlErrNo === 2627 || sqlErrNo === 2601) {
      res.status(409).json({ error: 'Email already exists.' });
      return;
    }
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

// One-click demo login: hands out a token for the single hard-coded showcase
// account so anyone can explore the app without credentials. It can ONLY ever
// log into the demo account, never an arbitrary one, so there's no password.
router.post('/demo', async (_req, res) => {
  try {
    const result = await getPool().request()
      .input('email', sql.NVarChar(200), DEMO_EMAIL)
      .query('SELECT id, email, name FROM users WHERE email = @email');
    const user = result.recordset[0] as { id: number; email: string; name: string | null } | undefined;
    if (!user) {
      res.status(404).json({ error: 'Demo account is not set up.' });
      return;
    }
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error('Auth demo error:', err);
    res.status(500).json({ error: 'Failed to start demo session.' });
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

// ── Delete my account and all my data (GDPR/CCPA-style erasure) ────────
// Requires the account password. Best-effort disconnects every linked Plaid
// item (so Plaid stops sharing data), then purges all of this user's rows in
// FK-safe order inside a single transaction, and finally the user record.
router.delete('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { password } = req.body as { password?: string };
    if (!password) {
      res.status(400).json({ error: 'Your password is required to delete your account.' });
      return;
    }

    const pool = getPool();
    const acct = await pool.request()
      .input('id', sql.Int, userId)
      .query('SELECT email, password AS passwordHash FROM users WHERE id = @id');
    const row = acct.recordset[0] as { email: string; passwordHash: string } | undefined;
    if (!row) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    if (row.email === DEMO_EMAIL) {
      res.status(403).json({ error: 'The demo account cannot be deleted.' });
      return;
    }
    if (!(await bcrypt.compare(password, row.passwordHash))) {
      res.status(401).json({ error: 'Password is incorrect.' });
      return;
    }

    // Tell Plaid to stop sharing this user's bank data. Best-effort: a failed
    // itemRemove must not block erasure of our own copy.
    const items = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT access_token FROM plaid_items WHERE user_id = @userId');
    for (const it of items.recordset as { access_token: string }[]) {
      try { await plaid.itemRemove({ access_token: decryptSecret(it.access_token) }); }
      catch { /* non-fatal — we still delete our stored copy below */ }
    }

    // FK-safe delete order: children before parents. All rows scoped to @userId.
    const tables = [
      'transactions', 'uploads', 'merchant_rules', 'savings_contributions',
      'budgets', 'savings_goals', 'accounts', 'categories', 'plaid_items',
      'ai_usage', 'app_settings',
    ];
    const tx = pool.transaction();
    await tx.begin();
    try {
      for (const t of tables) {
        await tx.request().input('userId', sql.Int, userId)
          .query(`DELETE FROM ${t} WHERE user_id = @userId`);
      }
      await tx.request().input('id', sql.Int, userId)
        .query('DELETE FROM users WHERE id = @id');
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account.' });
  }
});

export default router;

import { Router, Response } from 'express';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await getPool().request()
      .input('userId', sql.Int, req.userId)
      .query(`
        SELECT
          a.id, a.name, a.type, a.institution, a.created_at, a.current_balance, a.credit_limit, a.is_archived,
          COUNT(t.id) AS transaction_count,
          -- Historical/backfill rows are excluded from the derived balance so a
          -- prior-year import doesn't move the dashboard's current debt/cash.
          SUM(CASE WHEN t.is_historical = 0
                   THEN (CASE WHEN t.type='credit' THEN t.amount ELSE -t.amount END)
                   ELSE 0 END) AS balance
        FROM accounts a
        LEFT JOIN transactions t ON t.account_id = a.id AND t.user_id = @userId
        WHERE a.user_id = @userId
        GROUP BY a.id, a.name, a.type, a.institution, a.created_at, a.current_balance, a.credit_limit, a.is_archived
        ORDER BY a.is_archived, a.institution, a.name
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// PUT /api/accounts/:id/credit-limit  { creditLimit: number | null }
// Set (or clear) a credit card's limit, so the dashboard can show utilization
// and warn as it approaches the 30% guideline.
router.put('/:id/credit-limit', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id ?? '0');
    if (!id) { res.status(400).json({ error: 'Invalid account id' }); return; }
    const raw = (req.body as { creditLimit?: unknown }).creditLimit;
    const creditLimit = raw === null || raw === '' ? null : Number(raw);
    if (creditLimit !== null && (!Number.isFinite(creditLimit) || creditLimit < 0)) {
      res.status(400).json({ error: 'creditLimit must be a positive number or null' });
      return;
    }
    const result = await getPool().request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, req.userId)
      .input('limit', sql.Decimal(14, 2), creditLimit)
      .query(`UPDATE accounts SET credit_limit = @limit
              WHERE id = @id AND user_id = @userId AND type = 'credit'`);
    if ((result.rowsAffected[0] ?? 0) === 0) {
      res.status(404).json({ error: 'Credit account not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update credit limit' });
  }
});

// PUT /api/accounts/:id/archive  { archived: boolean }
// Soft-hide (or restore) an account. Transactions are kept — only the account's
// visibility in uploads / utilization / current balances changes.
router.put('/:id/archive', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id ?? '0');
    if (!id) { res.status(400).json({ error: 'Invalid account id' }); return; }
    const archived = (req.body as { archived?: unknown }).archived === true;
    const result = await getPool().request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, req.userId)
      .input('archived', sql.Bit, archived)
      .query(`UPDATE accounts SET is_archived = @archived WHERE id = @id AND user_id = @userId`);
    if ((result.rowsAffected[0] ?? 0) === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to archive account' });
  }
});

export default router;

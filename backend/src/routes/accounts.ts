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
          a.id, a.name, a.type, a.institution, a.created_at, a.current_balance,
          COUNT(t.id) AS transaction_count,
          SUM(CASE WHEN t.type='credit' THEN t.amount ELSE -t.amount END) AS balance
        FROM accounts a
        LEFT JOIN transactions t ON t.account_id = a.id AND t.user_id = @userId
        WHERE a.user_id = @userId OR a.user_id IS NULL
        GROUP BY a.id, a.name, a.type, a.institution, a.created_at, a.current_balance
        ORDER BY a.institution, a.name
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

export default router;

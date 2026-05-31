import { Router } from 'express';
import { getPool } from '../config/db';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT
        a.id, a.name, a.type, a.institution, a.created_at,
        COUNT(t.id) AS transaction_count,
        SUM(CASE WHEN t.type='credit' THEN t.amount ELSE -t.amount END) AS balance
      FROM accounts a
      LEFT JOIN transactions t ON t.account_id = a.id
      GROUP BY a.id, a.name, a.type, a.institution, a.created_at
      ORDER BY a.institution, a.name
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

export default router;

import { Router, Response } from 'express';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/budgets — each budget with this-month and last-month spend, a summary,
// and "where to cut back" suggestions derived from last month's biggest
// un-budgeted spending categories.
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId;
    const now = new Date();
    const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMo = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMo   = new Date(now.getFullYear(), now.getMonth(), 0);

    const [budgetsRes, suggRes] = await Promise.all([
      pool.request()
        .input('userId', sql.Int, userId)
        .input('start', sql.Date, startOfMonth)
        .input('lmStart', sql.Date, startOfLastMo)
        .input('lmEnd', sql.Date, endOfLastMo)
        .query(`
          SELECT b.category_id AS categoryId, c.name, c.icon, c.color,
                 b.monthly_limit AS monthlyLimit,
                 ISNULL(tm.spent, 0) AS spent,
                 ISNULL(lm.spent, 0) AS lastMonthSpent
          FROM budgets b
          JOIN categories c ON c.id = b.category_id
          LEFT JOIN (
            SELECT category_id, SUM(amount) AS spent FROM transactions
            WHERE user_id = @userId AND type = 'debit' AND date >= @start GROUP BY category_id
          ) tm ON tm.category_id = b.category_id
          LEFT JOIN (
            SELECT category_id, SUM(amount) AS spent FROM transactions
            WHERE user_id = @userId AND type = 'debit' AND date BETWEEN @lmStart AND @lmEnd GROUP BY category_id
          ) lm ON lm.category_id = b.category_id
          WHERE b.user_id = @userId
          ORDER BY c.name
        `),
      pool.request()
        .input('userId', sql.Int, userId)
        .input('lmStart', sql.Date, startOfLastMo)
        .input('lmEnd', sql.Date, endOfLastMo)
        .query(`
          SELECT TOP 5 c.id AS categoryId, c.name, c.icon, c.color, SUM(t.amount) AS lastMonthSpent
          FROM transactions t JOIN categories c ON c.id = t.category_id
          WHERE t.user_id = @userId AND t.type = 'debit'
            AND t.date BETWEEN @lmStart AND @lmEnd
            AND c.name NOT IN ('Transfer', 'Income', 'Investments')
            AND c.id NOT IN (SELECT category_id FROM budgets WHERE user_id = @userId)
          GROUP BY c.id, c.name, c.icon, c.color
          ORDER BY SUM(t.amount) DESC
        `),
    ]);

    const budgets = budgetsRes.recordset.map((b) => ({
      categoryId: b.categoryId, name: b.name, icon: b.icon, color: b.color,
      limit: Number(b.monthlyLimit), spent: Number(b.spent), lastMonthSpent: Number(b.lastMonthSpent),
    }));

    // Suggest a target ~10% below last month — an achievable cut.
    const suggestions = suggRes.recordset.map((s) => {
      const last = Number(s.lastMonthSpent);
      return {
        categoryId: s.categoryId, name: s.name, icon: s.icon, color: s.color,
        lastMonthSpent: last, suggestedLimit: Math.max(1, Math.round((last * 0.9) / 5) * 5),
      };
    });

    res.json({
      budgets,
      summary: {
        totalLimit: budgets.reduce((a, b) => a + b.limit, 0),
        totalSpent: budgets.reduce((a, b) => a + b.spent, 0),
      },
      suggestions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load budgets' });
  }
});

// PUT /api/budgets — create or update a budget { categoryId, limit }
router.put('/', async (req: AuthRequest, res: Response) => {
  try {
    const { categoryId, limit } = req.body as { categoryId?: unknown; limit?: unknown };
    const cat = Number(categoryId);
    const lim = Number(limit);
    if (!Number.isInteger(cat) || cat < 1 || !Number.isFinite(lim) || lim < 0) {
      res.status(400).json({ error: 'categoryId and a non-negative limit are required' });
      return;
    }
    await getPool().request()
      .input('userId', sql.Int, req.userId)
      .input('cat', sql.Int, cat)
      .input('lim', sql.Decimal(12, 2), lim)
      .query(`
        MERGE budgets AS t USING (SELECT @userId AS u, @cat AS c) s
          ON t.user_id = s.u AND t.category_id = s.c
        WHEN MATCHED THEN UPDATE SET monthly_limit = @lim
        WHEN NOT MATCHED THEN INSERT (user_id, category_id, monthly_limit) VALUES (@userId, @cat, @lim);
      `);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save budget' });
  }
});

// DELETE /api/budgets/:categoryId
router.delete('/:categoryId', async (req: AuthRequest, res: Response) => {
  try {
    const cat = parseInt(req.params.categoryId ?? '0');
    await getPool().request()
      .input('userId', sql.Int, req.userId)
      .input('cat', sql.Int, cat)
      .query(`DELETE FROM budgets WHERE user_id = @userId AND category_id = @cat`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

export default router;

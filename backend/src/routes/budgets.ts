import { Router, Response } from 'express';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';
import { generateBudgetPlan } from '../services/aiService';
import { NET_SPEND } from '../config/spending';
import { categoryUsableByUser, filterUsableCategoryIds } from '../services/categoryAccess';

const router = Router();

// Last full calendar month, used by the AI plan and the suggestions.
function lastMonthRange(now = new Date()) {
  return {
    start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    end: new Date(now.getFullYear(), now.getMonth(), 0),
  };
}

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
            -- Net of refunds: a credit in a category reduces its spend.
            SELECT category_id, SUM(CASE WHEN type = 'debit' THEN amount ELSE -amount END) AS spent
            FROM transactions
            WHERE user_id = @userId AND date >= @start GROUP BY category_id
          ) tm ON tm.category_id = b.category_id
          LEFT JOIN (
            SELECT category_id, SUM(CASE WHEN type = 'debit' THEN amount ELSE -amount END) AS spent
            FROM transactions
            WHERE user_id = @userId AND date BETWEEN @lmStart AND @lmEnd GROUP BY category_id
          ) lm ON lm.category_id = b.category_id
          WHERE b.user_id = @userId
          ORDER BY c.name
        `),
      pool.request()
        .input('userId', sql.Int, userId)
        .input('lmStart', sql.Date, startOfLastMo)
        .input('lmEnd', sql.Date, endOfLastMo)
        .query(`
          SELECT TOP 5 c.id AS categoryId, c.name, c.icon, c.color, SUM(${NET_SPEND}) AS lastMonthSpent
          FROM transactions t JOIN categories c ON c.id = t.category_id
          WHERE t.user_id = @userId
            AND t.date BETWEEN @lmStart AND @lmEnd
            AND c.name NOT IN ('Transfer', 'Income', 'Investments')
            AND c.id NOT IN (SELECT category_id FROM budgets WHERE user_id = @userId)
          GROUP BY c.id, c.name, c.icon, c.color
          HAVING SUM(${NET_SPEND}) > 0
          ORDER BY SUM(${NET_SPEND}) DESC
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
    if (!(await categoryUsableByUser(req.userId!, cat))) {
      res.status(404).json({ error: 'Category not found' });
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

// POST /api/budgets/generate — ask the AI to propose a full budget across every
// category you spent in last month, targeting an overall reduction. Returns a
// plan for review; it is NOT saved until the client applies it via /bulk.
router.post('/generate', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId;
    const { reductionPercent } = req.body as { reductionPercent?: unknown };
    const reduction = Math.min(Math.max(Number(reductionPercent ?? 10) || 0, 0), 90);

    const { start, end } = lastMonthRange();
    const spendRes = await pool.request()
      .input('userId', sql.Int, userId)
      .input('s', sql.Date, start)
      .input('e', sql.Date, end)
      .query(`
        SELECT c.id AS categoryId, c.name, c.icon, c.color, SUM(${NET_SPEND}) AS lastMonthSpent
        FROM transactions t JOIN categories c ON c.id = t.category_id
        WHERE t.user_id = @userId
          AND t.date BETWEEN @s AND @e
          AND c.name NOT IN ('Transfer', 'Income', 'Investments')
        GROUP BY c.id, c.name, c.icon, c.color
        HAVING SUM(${NET_SPEND}) > 0
        ORDER BY SUM(${NET_SPEND}) DESC
      `);

    const cats = spendRes.recordset.map((r) => ({
      categoryId: r.categoryId as number,
      name: r.name as string,
      icon: r.icon as string,
      color: r.color as string,
      lastMonthSpent: Number(r.lastMonthSpent),
    }));

    if (cats.length === 0) {
      res.json({ plan: [], reductionPercent: reduction });
      return;
    }

    const limits = await generateBudgetPlan(
      userId!,
      cats.map((c) => ({ categoryId: c.categoryId, name: c.name, lastMonthSpent: c.lastMonthSpent })),
      reduction,
    );
    const limitById = new Map(limits.map((l) => [l.categoryId, l]));

    const plan = cats.map((c) => ({
      categoryId: c.categoryId, name: c.name, icon: c.icon, color: c.color,
      lastMonthSpent: c.lastMonthSpent,
      suggestedLimit: limitById.get(c.categoryId)?.suggestedLimit ?? c.lastMonthSpent,
      note: limitById.get(c.categoryId)?.note ?? '',
    }));

    res.json({ plan, reductionPercent: reduction });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate budget plan' });
  }
});

// PUT /api/budgets/bulk — create/update many budgets at once { items: [{categoryId, limit}] }.
// Powers "Apply AI plan" and "Trim all".
router.put('/bulk', async (req: AuthRequest, res: Response) => {
  try {
    const { items } = req.body as { items?: { categoryId?: unknown; limit?: unknown }[] };
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'items must be a non-empty array' });
      return;
    }

    let clean = items
      .map((i) => ({ cat: Number(i.categoryId), lim: Number(i.limit) }))
      .filter((i) => Number.isInteger(i.cat) && i.cat > 0 && Number.isFinite(i.lim) && i.lim >= 0);

    // Drop any category ids that aren't visible to this user (system or own).
    const usable = await filterUsableCategoryIds(req.userId!, clean.map((i) => i.cat));
    clean = clean.filter((i) => usable.has(i.cat));

    if (clean.length === 0) {
      res.status(400).json({ error: 'no valid budget items provided' });
      return;
    }

    const pool = getPool();
    const tx = pool.transaction();
    await tx.begin();
    try {
      for (const i of clean) {
        await tx.request()
          .input('userId', sql.Int, req.userId)
          .input('cat', sql.Int, i.cat)
          .input('lim', sql.Decimal(12, 2), i.lim)
          .query(`
            MERGE budgets AS t USING (SELECT @userId AS u, @cat AS c) s
              ON t.user_id = s.u AND t.category_id = s.c
            WHEN MATCHED THEN UPDATE SET monthly_limit = @lim
            WHEN NOT MATCHED THEN INSERT (user_id, category_id, monthly_limit) VALUES (@userId, @cat, @lim);
          `);
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    res.json({ success: true, updated: clean.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save budgets' });
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

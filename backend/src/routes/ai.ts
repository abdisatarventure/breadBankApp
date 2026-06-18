import { Router, Response } from 'express';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';
import { SPEND_AMOUNT, INCOME_AMOUNT, NET_SPEND, SPENDING_FILTER } from '../config/spending';
import {
  generateMonthlySummary,
  generateSuggestions,
  answerFinanceQuestion,
  getAiStatus,
} from '../services/aiService';

const router = Router();

// GET /api/ai/status — token usage, estimated spend, budget, and whether the
// Anthropic credit balance has been exhausted. Powers the Settings warning.
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getAiStatus(req.userId!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load AI status' });
  }
});

// PUT /api/ai/budget  { budget: number | null } — set/clear the monthly budget.
router.put('/budget', async (req: AuthRequest, res: Response) => {
  try {
    const { budget } = req.body as { budget: unknown };
    const value = budget === null || budget === '' ? null : Number(budget);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      res.status(400).json({ error: 'budget must be a non-negative number or null' });
      return;
    }
    await getPool().request()
      .input('u', sql.Int, req.userId)
      .input('v', sql.NVarChar(50), value === null ? null : String(value))
      .query(`
        MERGE app_settings AS t
        USING (SELECT @u AS user_id, 'ai_monthly_budget' AS setting_key) AS s
          ON t.user_id = s.user_id AND t.setting_key = s.setting_key
        WHEN MATCHED THEN UPDATE SET setting_value = @v
        WHEN NOT MATCHED THEN INSERT (user_id, setting_key, setting_value) VALUES (@u, 'ai_monthly_budget', @v);
      `);
    res.json(await getAiStatus(req.userId!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

// POST /api/ai/summary  { month: 1-12, year: 2026 }
router.post('/summary', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId;
    const { month, year } = req.body as { month: unknown; year: unknown };

    const m = Number(month);
    const y = Number(year);
    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 2000 || y > 2100) {
      res.status(400).json({ error: 'month must be 1–12 and year must be between 2000 and 2100' });
      return;
    }

    const start    = new Date(y, m - 1, 1);
    const end      = new Date(y, m, 0);
    const prevStart = new Date(y, m - 2, 1);
    const prevEnd   = new Date(y, m - 1, 0);

    const [cur, prev, topCat, topMerch, subs, cats] = await Promise.all([
      pool.request().input('userId', sql.Int, userId).input('s', sql.Date, start).input('e', sql.Date, end).query(`
        SELECT
          SUM(${SPEND_AMOUNT})  AS spending,
          SUM(${INCOME_AMOUNT}) AS income
        FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = @userId AND t.date BETWEEN @s AND @e
      `),
      pool.request().input('userId', sql.Int, userId).input('s', sql.Date, prevStart).input('e', sql.Date, prevEnd).query(`
        SELECT SUM(${SPEND_AMOUNT}) AS spending
        FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = @userId AND t.date BETWEEN @s AND @e
      `),
      pool.request().input('userId', sql.Int, userId).input('s', sql.Date, start).input('e', sql.Date, end).query(`
        SELECT TOP 1 c.name, SUM(${NET_SPEND}) AS total
        FROM transactions t JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = @userId AND t.date BETWEEN @s AND @e AND ${SPENDING_FILTER}
        GROUP BY c.name HAVING SUM(${NET_SPEND}) > 0 ORDER BY total DESC
      `),
      pool.request().input('userId', sql.Int, userId).input('s', sql.Date, start).input('e', sql.Date, end).query(`
        SELECT TOP 1 t.merchant, SUM(${NET_SPEND}) AS total
        FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = @userId AND t.date BETWEEN @s AND @e
          AND t.merchant IS NOT NULL AND t.merchant != ''
          AND ${SPENDING_FILTER}
        GROUP BY t.merchant HAVING SUM(${NET_SPEND}) > 0 ORDER BY total DESC
      `),
      pool.request().input('userId', sql.Int, userId).input('s', sql.Date, start).input('e', sql.Date, end).query(`
        SELECT
          SUM(CASE WHEN t.type='debit' THEN 1 ELSE 0 END) AS cnt,
          COALESCE(SUM(${NET_SPEND}),0) AS total
        FROM transactions t JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = @userId AND c.name='Subscriptions' AND t.date BETWEEN @s AND @e
      `),
      pool.request().input('userId', sql.Int, userId).input('s', sql.Date, start).input('e', sql.Date, end).query(`
        SELECT c.name AS category, SUM(${NET_SPEND}) AS amount
        FROM transactions t JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = @userId AND t.date BETWEEN @s AND @e AND ${SPENDING_FILTER}
        GROUP BY c.name HAVING SUM(${NET_SPEND}) > 0 ORDER BY amount DESC
      `),
    ]);

    const spending    = (cur.recordset[0] as { spending: number; income: number })?.spending ?? 0;
    const income      = (cur.recordset[0] as { spending: number; income: number })?.income   ?? 0;
    const savingsRate = income > 0 ? ((income - spending) / income) * 100 : 0;
    const monthName   = start.toLocaleString('default', { month: 'long', year: 'numeric' });

    const base = {
      month:                   monthName,
      totalSpending:           spending,
      totalIncome:             income,
      previousMonthSpending:   (prev.recordset[0] as { spending: number })?.spending ?? 0,
      topCategory:             (topCat.recordset[0]  as { name: string;  total: number } | undefined)?.name  ?? 'N/A',
      topCategoryAmount:       (topCat.recordset[0]  as { name: string;  total: number } | undefined)?.total ?? 0,
      topMerchant:             (topMerch.recordset[0] as { merchant: string; total: number } | undefined)?.merchant ?? 'N/A',
      topMerchantAmount:       (topMerch.recordset[0] as { merchant: string; total: number } | undefined)?.total    ?? 0,
      subscriptionCount:       (subs.recordset[0] as { cnt: number; total: number })?.cnt   ?? 0,
      subscriptionTotal:       (subs.recordset[0] as { cnt: number; total: number })?.total ?? 0,
      savingsRate,
    };

    const [summary, suggestions] = await Promise.all([
      generateMonthlySummary(userId!, base),
      generateSuggestions(userId!, {
        ...base,
        categoryBreakdown: (cats.recordset as { category: string; amount: number }[]),
        unusedSubscriptions: [],
      }),
    ]);

    res.json({ summary, suggestions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate AI summary' });
  }
});

// POST /api/ai/chat  { question: string }
router.post('/chat', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId;
    const { question } = req.body as { question: string };

    const [recent, topCats] = await Promise.all([
      pool.request().input('userId', sql.Int, userId).query(`
        SELECT
          SUM(${SPEND_AMOUNT})  AS spending,
          SUM(${INCOME_AMOUNT}) AS income
        FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = @userId AND t.date >= DATEADD(MONTH,-1,GETDATE())
      `),
      pool.request().input('userId', sql.Int, userId).query(`
        SELECT TOP 5 c.name, SUM(${NET_SPEND}) AS total
        FROM transactions t JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = @userId AND t.date >= DATEADD(MONTH,-1,GETDATE()) AND ${SPENDING_FILTER}
        GROUP BY c.name HAVING SUM(${NET_SPEND}) > 0 ORDER BY total DESC
      `),
    ]);

    const r = recent.recordset[0] as { spending: number; income: number } | undefined;
    const context = [
      `Last 30 days — Spent: $${(r?.spending ?? 0).toFixed(2)}, Income: $${(r?.income ?? 0).toFixed(2)}`,
      `Top categories: ${(topCats.recordset as { name: string; total: number }[])
        .map(c => `${c.name} $${c.total.toFixed(2)}`).join(', ')}`,
    ].join('\n');

    const answer = await answerFinanceQuestion(userId!, question, context);
    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI chat failed' });
  }
});

export default router;

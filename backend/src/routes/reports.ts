import { Router, Response } from 'express';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId;
    const now = new Date();
    const currentYearStart = new Date(now.getFullYear(), 0, 1);
    const priorYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sameMonthLastYearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const sameMonthLastYearEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);
    const last12MonthsStart = new Date(now.getFullYear(), now.getMonth(), 1);
    last12MonthsStart.setMonth(last12MonthsStart.getMonth() - 11);

    const [topMerchants, yearOverview, categoryTrends] = await Promise.all([
      pool.request()
        .input('userId', sql.Int, userId)
        .input('start', sql.Date, last12MonthsStart)
        .query(`
          SELECT TOP 6
            t.merchant,
            SUM(t.amount) AS total,
            COUNT(*) AS txCount
          FROM transactions t
          LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.user_id = @userId
            AND t.type = 'debit'
            AND t.date >= @start
            AND t.merchant IS NOT NULL
            AND t.merchant != ''
            AND ISNULL(c.name, '') <> 'Transfer'
          GROUP BY t.merchant
          ORDER BY total DESC
        `),

      pool.request()
        .input('userId', sql.Int, userId)
        .input('currentYearStart', sql.Date, currentYearStart)
        .input('priorYearStart', sql.Date, priorYearStart)
        .input('currentMonthStart', sql.Date, currentMonthStart)
        .input('sameMonthLastYearStart', sql.Date, sameMonthLastYearStart)
        .input('sameMonthLastYearEnd', sql.Date, sameMonthLastYearEnd)
        .query(`
          SELECT
            SUM(CASE WHEN t.date >= @currentYearStart AND t.type = 'debit' THEN t.amount ELSE 0 END) AS currentYearTotal,
            SUM(CASE WHEN t.date >= @priorYearStart AND t.date < @currentYearStart AND t.type = 'debit' THEN t.amount ELSE 0 END) AS priorYearTotal,
            SUM(CASE WHEN t.date >= @currentMonthStart AND t.type = 'debit' THEN t.amount ELSE 0 END) AS currentMonthTotal,
            SUM(CASE WHEN t.date >= @sameMonthLastYearStart AND t.date <= @sameMonthLastYearEnd AND t.type = 'debit' THEN t.amount ELSE 0 END) AS priorMonthTotal
          FROM transactions t
          LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.user_id = @userId
            AND ISNULL(c.name, '') <> 'Transfer'
        `),

      pool.request()
        .input('userId', sql.Int, userId)
        .input('currentYearStart', sql.Date, currentYearStart)
        .input('priorYearStart', sql.Date, priorYearStart)
        .query(`
          SELECT
            COALESCE(cur.category, prev.category, 'Uncategorized') AS category,
            ISNULL(cur.total, 0) AS thisYearTotal,
            ISNULL(prev.total, 0) AS lastYearTotal
          FROM (
            SELECT c.name AS category, SUM(t.amount) AS total
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = @userId
              AND t.type = 'debit'
              AND t.date >= @currentYearStart
              AND c.name <> 'Transfer'
            GROUP BY c.name
          ) cur
          FULL OUTER JOIN (
            SELECT c.name AS category, SUM(t.amount) AS total
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = @userId
              AND t.type = 'debit'
              AND t.date >= @priorYearStart
              AND t.date < @currentYearStart
              AND c.name <> 'Transfer'
            GROUP BY c.name
          ) prev ON cur.category = prev.category
          ORDER BY ISNULL(cur.total, 0) + ISNULL(prev.total, 0) DESC;
        `),
    ]);

    const overview = yearOverview.recordset[0] as {
      currentYearTotal: number;
      priorYearTotal: number;
      currentMonthTotal: number;
      priorMonthTotal: number;
    };

    res.json({
      topMerchants: topMerchants.recordset,
      yearOverview: {
        currentYearTotal: overview.currentYearTotal ?? 0,
        priorYearTotal: overview.priorYearTotal ?? 0,
        currentMonthTotal: overview.currentMonthTotal ?? 0,
        priorMonthTotal: overview.priorMonthTotal ?? 0,
      },
      categoryTrends: categoryTrends.recordset,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load reports data' });
  }
});

export default router;

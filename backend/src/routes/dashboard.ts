import { Router, Response } from 'express';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';
import { SPEND_AMOUNT, INCOME_AMOUNT, NET_SPEND, SPENDING_FILTER } from '../config/spending';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId;
    const now = new Date();
    const startOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMo  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMo    = new Date(now.getFullYear(), now.getMonth(), 0);
    const startOfYear    = new Date(now.getFullYear(), 0, 1);

    const [currentMo, lastMo, categories, trend, topMerchants, parking] = await Promise.all([
      pool.request()
        .input('userId', sql.Int, userId)
        .input('start', sql.Date, startOfMonth)
        .query(`
          SELECT
            SUM(${SPEND_AMOUNT})  AS totalSpending,
            SUM(${INCOME_AMOUNT}) AS totalIncome
          FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.user_id = @userId AND t.date >= @start
        `),

      pool.request()
        .input('userId', sql.Int, userId)
        .input('start', sql.Date, startOfLastMo)
        .input('end',   sql.Date, endOfLastMo)
        .query(`
          SELECT SUM(${SPEND_AMOUNT}) AS totalSpending
          FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.user_id = @userId AND t.date BETWEEN @start AND @end
        `),

      pool.request()
        .input('userId', sql.Int, userId)
        .input('start', sql.Date, startOfMonth)
        .query(`
          SELECT c.name AS category, SUM(${NET_SPEND}) AS total
          FROM transactions t JOIN categories c ON t.category_id = c.id
          WHERE t.user_id = @userId AND t.date >= @start AND ${SPENDING_FILTER}
          GROUP BY c.name HAVING SUM(${NET_SPEND}) > 0 ORDER BY total DESC
        `),

      pool.request()
        .input('userId', sql.Int, userId)
        .query(`
        SELECT
          FORMAT(t.date,'MMM')     AS month,
          FORMAT(t.date,'yyyy-MM') AS monthKey,
          SUM(${SPEND_AMOUNT})  AS spending,
          SUM(${INCOME_AMOUNT}) AS income
        FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = @userId
          AND t.date >= DATEADD(MONTH,-5,DATEFROMPARTS(YEAR(GETDATE()),MONTH(GETDATE()),1))
        GROUP BY FORMAT(t.date,'MMM'), FORMAT(t.date,'yyyy-MM')
        ORDER BY monthKey
      `),

      pool.request()
        .input('userId', sql.Int, userId)
        .input('start', sql.Date, startOfMonth)
        .query(`
          SELECT TOP 5 t.merchant, SUM(${NET_SPEND}) AS total, COUNT(*) AS txCount
          FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.user_id = @userId AND t.date >= @start
            AND t.merchant IS NOT NULL AND t.merchant != ''
            AND ${SPENDING_FILTER}
          GROUP BY t.merchant HAVING SUM(${NET_SPEND}) > 0 ORDER BY total DESC
        `),

      pool.request()
        .input('userId', sql.Int, userId)
        .input('monthStart', sql.Date, startOfMonth)
        .input('yearStart', sql.Date, startOfYear)
        .query(`
          SELECT
            SUM(CASE WHEN t.date >= @monthStart THEN t.amount ELSE 0 END) AS monthTotal,
            SUM(CASE WHEN t.date >= @monthStart THEN 1 ELSE 0 END)        AS monthTxCount,
            SUM(t.amount) AS yearTotal
          FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.user_id = @userId AND t.date >= @yearStart AND t.type='debit'
            AND (t.merchant LIKE '%METROPOLIS PARKING%' OR t.description LIKE '%METROPOLIS PARKING%')
            AND ISNULL(c.name,'') <> 'Transfer'
        `),
    ]);

    const s = currentMo.recordset[0] as { totalSpending: number; totalIncome: number } | undefined;
    const spending    = s?.totalSpending ?? 0;
    const income      = s?.totalIncome   ?? 0;
    const savings     = income - spending;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;
    const prevSpend   = (lastMo.recordset[0] as { totalSpending: number } | undefined)?.totalSpending ?? 0;
    const park        = parking.recordset[0] as { monthTotal: number; monthTxCount: number; yearTotal: number } | undefined;

    res.json({
      totalSpending:          spending,
      totalIncome:            income,
      netSavings:             savings,
      savingsRate,
      previousMonthSpending:  prevSpend,
      categoryBreakdown:      categories.recordset,
      monthlyTrend:           trend.recordset,
      topMerchants:           topMerchants.recordset,
      parkingSpend:           park?.monthTotal ?? 0,
      parkingTxCount:         park?.monthTxCount ?? 0,
      parkingSpendYtd:        park?.yearTotal ?? 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

export default router;

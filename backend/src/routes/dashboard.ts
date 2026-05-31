import { Router } from 'express';
import { getPool, sql } from '../config/db';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const pool = getPool();
    const now = new Date();
    const startOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMo  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMo    = new Date(now.getFullYear(), now.getMonth(), 0);

    const [currentMo, lastMo, categories, trend, topMerchants] = await Promise.all([
      pool.request()
        .input('start', sql.Date, startOfMonth)
        .query(`
          SELECT
            SUM(CASE WHEN type='debit'  THEN amount ELSE 0 END) AS totalSpending,
            SUM(CASE WHEN type='credit' THEN amount ELSE 0 END) AS totalIncome
          FROM transactions WHERE date >= @start
        `),

      pool.request()
        .input('start', sql.Date, startOfLastMo)
        .input('end',   sql.Date, endOfLastMo)
        .query(`
          SELECT SUM(CASE WHEN type='debit' THEN amount ELSE 0 END) AS totalSpending
          FROM transactions WHERE date BETWEEN @start AND @end
        `),

      pool.request()
        .input('start', sql.Date, startOfMonth)
        .query(`
          SELECT c.name AS category, SUM(t.amount) AS total
          FROM transactions t JOIN categories c ON t.category_id = c.id
          WHERE t.date >= @start AND t.type = 'debit'
          GROUP BY c.name ORDER BY total DESC
        `),

      pool.request().query(`
        SELECT
          FORMAT(date,'MMM')     AS month,
          FORMAT(date,'yyyy-MM') AS monthKey,
          SUM(CASE WHEN type='debit'  THEN amount ELSE 0 END) AS spending,
          SUM(CASE WHEN type='credit' THEN amount ELSE 0 END) AS income
        FROM transactions
        WHERE date >= DATEADD(MONTH,-5,DATEFROMPARTS(YEAR(GETDATE()),MONTH(GETDATE()),1))
        GROUP BY FORMAT(date,'MMM'), FORMAT(date,'yyyy-MM')
        ORDER BY monthKey
      `),

      pool.request()
        .input('start', sql.Date, startOfMonth)
        .query(`
          SELECT TOP 5 merchant, SUM(amount) AS total, COUNT(*) AS txCount
          FROM transactions
          WHERE date >= @start AND type='debit'
            AND merchant IS NOT NULL AND merchant != ''
          GROUP BY merchant ORDER BY total DESC
        `),
    ]);

    const s = currentMo.recordset[0] as { totalSpending: number; totalIncome: number } | undefined;
    const spending    = s?.totalSpending ?? 0;
    const income      = s?.totalIncome   ?? 0;
    const savings     = income - spending;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;
    const prevSpend   = (lastMo.recordset[0] as { totalSpending: number } | undefined)?.totalSpending ?? 0;

    res.json({
      totalSpending:          spending,
      totalIncome:            income,
      netSavings:             savings,
      savingsRate,
      previousMonthSpending:  prevSpend,
      categoryBreakdown:      categories.recordset,
      monthlyTrend:           trend.recordset,
      topMerchants:           topMerchants.recordset,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

export default router;

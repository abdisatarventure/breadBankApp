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
            SUM(CASE WHEN t.type='debit'  THEN t.amount ELSE 0 END) AS totalSpending,
            SUM(CASE WHEN t.type='credit' THEN t.amount ELSE 0 END) AS totalIncome
          FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.date >= @start AND ISNULL(c.name,'') <> 'Transfer'
        `),

      pool.request()
        .input('start', sql.Date, startOfLastMo)
        .input('end',   sql.Date, endOfLastMo)
        .query(`
          SELECT SUM(CASE WHEN t.type='debit' THEN t.amount ELSE 0 END) AS totalSpending
          FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.date BETWEEN @start AND @end AND ISNULL(c.name,'') <> 'Transfer'
        `),

      pool.request()
        .input('start', sql.Date, startOfMonth)
        .query(`
          SELECT c.name AS category, SUM(t.amount) AS total
          FROM transactions t JOIN categories c ON t.category_id = c.id
          WHERE t.date >= @start AND t.type = 'debit' AND c.name <> 'Transfer'
          GROUP BY c.name ORDER BY total DESC
        `),

      pool.request().query(`
        SELECT
          FORMAT(t.date,'MMM')     AS month,
          FORMAT(t.date,'yyyy-MM') AS monthKey,
          SUM(CASE WHEN t.type='debit'  THEN t.amount ELSE 0 END) AS spending,
          SUM(CASE WHEN t.type='credit' THEN t.amount ELSE 0 END) AS income
        FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.date >= DATEADD(MONTH,-5,DATEFROMPARTS(YEAR(GETDATE()),MONTH(GETDATE()),1))
          AND ISNULL(c.name,'') <> 'Transfer'
        GROUP BY FORMAT(t.date,'MMM'), FORMAT(t.date,'yyyy-MM')
        ORDER BY monthKey
      `),

      pool.request()
        .input('start', sql.Date, startOfMonth)
        .query(`
          SELECT TOP 5 t.merchant, SUM(t.amount) AS total, COUNT(*) AS txCount
          FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.date >= @start AND t.type='debit'
            AND t.merchant IS NOT NULL AND t.merchant != ''
            AND ISNULL(c.name,'') <> 'Transfer'
          GROUP BY t.merchant ORDER BY total DESC
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

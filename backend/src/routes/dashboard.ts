import { Router, Response } from 'express';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';
import { SPEND_AMOUNT, INCOME_AMOUNT, NET_SPEND, SPENDING_FILTER } from '../config/spending';

const router = Router();

// Parking spend/count that nets out reversals & refunds: a purchase (debit) adds,
// a reversal (credit) subtracts, so a reversed charge cancels itself in both the
// dollar total and the visit count. Safe to interpolate — no user input.
const PARK_AMT = `(CASE WHEN t.type = 'debit' THEN t.amount ELSE -t.amount END)`;
const PARK_CNT = `(CASE WHEN t.type = 'debit' THEN 1 ELSE -1 END)`;

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId;
    const now = new Date();
    const startOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMo  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMo    = new Date(now.getFullYear(), now.getMonth(), 0);
    const startOfYear    = new Date(now.getFullYear(), 0, 1);

    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [currentMo, lastMo, categories, trend, topMerchants, parking, allocated, anomalyRows, refunds] = await Promise.all([
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
            SUM(CASE WHEN t.date >= @monthStart THEN ${PARK_AMT} ELSE 0 END) AS monthTotal,
            SUM(CASE WHEN t.date >= @monthStart THEN ${PARK_CNT} ELSE 0 END) AS monthTxCount,
            SUM(${PARK_AMT}) AS yearTotal
          FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.user_id = @userId AND t.date >= @yearStart
            -- Match 'METROPOLIS P' (not the full 'METROPOLIS PARKING') so the
            -- garage is caught however the card/bank formats it — e.g. Apple Card
            -- shows 'METROPOLIS PARKING 144 2ND AVE', while a Visa/Wells Fargo
            -- charge shows 'METROPOLIS P +18564856865'. Both start with the same
            -- token, so this stays specific to the parking vendor.
            AND (t.merchant LIKE '%METROPOLIS P%' OR t.description LIKE '%METROPOLIS P%')
            AND ISNULL(c.name,'') <> 'Transfer'
        `),

      // How much of this month's net savings has been allocated into savings goals.
      pool.request()
        .input('userId', sql.Int, userId)
        .input('mk', sql.Char(7), monthKey)
        .query(`
          SELECT ISNULL(SUM(amount), 0) AS allocated
          FROM savings_contributions WHERE user_id = @userId AND month_key = @mk
        `),

      // Anomaly detection: last-7-day spend per category vs the prior 12 weeks'
      // weekly average, to flag categories spiking this week.
      pool.request()
        .input('userId', sql.Int, userId)
        .query(`
          SELECT c.name AS category, c.color, c.icon,
            SUM(CASE WHEN t.date >= DATEADD(DAY,-7,CAST(GETDATE() AS DATE)) THEN ${NET_SPEND} ELSE 0 END) AS recent,
            SUM(CASE WHEN t.date <  DATEADD(DAY,-7,CAST(GETDATE() AS DATE)) THEN ${NET_SPEND} ELSE 0 END) AS base84
          FROM transactions t JOIN categories c ON t.category_id = c.id
          WHERE t.user_id = @userId
            AND t.date >= DATEADD(DAY,-91,CAST(GETDATE() AS DATE))
            AND ${SPENDING_FILTER}
          GROUP BY c.name, c.color, c.icon
        `),

      // Refunds tracked in their own 'Refund' category (excluded from income,
      // netted out of spending) — surfaced so they're visible, not just hidden.
      pool.request()
        .input('userId', sql.Int, userId)
        .input('monthStart', sql.Date, startOfMonth)
        .input('yearStart', sql.Date, startOfYear)
        .query(`
          SELECT
            ISNULL(SUM(CASE WHEN t.date >= @monthStart THEN t.amount ELSE 0 END), 0) AS monthRefunds,
            ISNULL(SUM(t.amount), 0) AS ytdRefunds
          FROM transactions t JOIN categories c ON c.id = t.category_id
          WHERE t.user_id = @userId AND c.name = 'Refund' AND t.type = 'credit' AND t.date >= @yearStart
        `),
    ]);

    const s = currentMo.recordset[0] as { totalSpending: number; totalIncome: number } | undefined;
    const spending    = s?.totalSpending ?? 0;
    const income      = s?.totalIncome   ?? 0;
    const savings     = income - spending;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;
    const prevSpend   = (lastMo.recordset[0] as { totalSpending: number } | undefined)?.totalSpending ?? 0;
    const park        = parking.recordset[0] as { monthTotal: number; monthTxCount: number; yearTotal: number } | undefined;
    const allocatedToGoals = Number((allocated.recordset[0] as { allocated: number } | undefined)?.allocated ?? 0);
    const refundRow   = refunds.recordset[0] as { monthRefunds: number; ytdRefunds: number } | undefined;

    // Flag categories where this week's spend is well above the prior 12-week
    // weekly average (and meaningful in dollars), so the dashboard can warn.
    type AnomalyRow = { category: string; color: string | null; icon: string | null; recent: number; base84: number };
    const anomalies = (anomalyRows.recordset as AnomalyRow[])
      .map((r) => {
        const recent = Number(r.recent);
        const avgWeek = Number(r.base84) / 12; // 84 days ≈ 12 weeks
        return { category: r.category, color: r.color, icon: r.icon, thisWeek: recent, avgWeek,
                 ratio: avgWeek > 0 ? recent / avgWeek : 0 };
      })
      // Needs real history, a spike of ≥2.5×, and at least $40 so tiny categories don't nag.
      .filter((a) => a.avgWeek > 0 && a.thisWeek >= 40 && a.ratio >= 2.5)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 3)
      .map((a) => ({ ...a, thisWeek: Math.round(a.thisWeek * 100) / 100, avgWeek: Math.round(a.avgWeek * 100) / 100,
                     ratio: Math.round(a.ratio * 10) / 10 }));

    res.json({
      totalSpending:          spending,
      totalIncome:            income,
      netSavings:             savings,
      savingsRate,
      // Net Savings itself is untouched; this just reports how much of it is still
      // free to put into savings goals (drives the dashboard's "unallocated" hint).
      allocatedToGoals,
      unallocatedSavings:     Math.max(0, savings - allocatedToGoals),
      refundsThisMonth:       Number(refundRow?.monthRefunds ?? 0),
      refundsYtd:             Number(refundRow?.ytdRefunds ?? 0),
      previousMonthSpending:  prevSpend,
      categoryBreakdown:      categories.recordset,
      monthlyTrend:           trend.recordset,
      topMerchants:           topMerchants.recordset,
      parkingSpend:           park?.monthTotal ?? 0,
      parkingTxCount:         park?.monthTxCount ?? 0,
      parkingSpendYtd:        park?.yearTotal ?? 0,
      anomalies,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

export default router;

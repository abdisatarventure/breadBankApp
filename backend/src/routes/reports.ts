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
            SUM(${NET_SPEND}) AS total,
            COUNT(*) AS txCount
          FROM transactions t
          LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.user_id = @userId
            AND t.date >= @start
            AND t.merchant IS NOT NULL
            AND t.merchant != ''
            AND ${SPENDING_FILTER}
          GROUP BY t.merchant
          HAVING SUM(${NET_SPEND}) > 0
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
            SUM(CASE WHEN t.date >= @currentYearStart THEN ${SPEND_AMOUNT} ELSE 0 END) AS currentYearTotal,
            SUM(CASE WHEN t.date >= @priorYearStart AND t.date < @currentYearStart THEN ${SPEND_AMOUNT} ELSE 0 END) AS priorYearTotal,
            SUM(CASE WHEN t.date >= @currentMonthStart THEN ${SPEND_AMOUNT} ELSE 0 END) AS currentMonthTotal,
            SUM(CASE WHEN t.date >= @sameMonthLastYearStart AND t.date <= @sameMonthLastYearEnd THEN ${SPEND_AMOUNT} ELSE 0 END) AS priorMonthTotal
          FROM transactions t
          LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.user_id = @userId
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
            SELECT c.name AS category, SUM(${NET_SPEND}) AS total
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = @userId
              AND t.date >= @currentYearStart
              AND ${SPENDING_FILTER}
            GROUP BY c.name
          ) cur
          FULL OUTER JOIN (
            SELECT c.name AS category, SUM(${NET_SPEND}) AS total
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = @userId
              AND t.date >= @priorYearStart
              AND t.date < @currentYearStart
              AND ${SPENDING_FILTER}
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

// GET /api/reports/monthly?year=YYYY
// Per-month spending / income / net for one calendar year, plus the list of
// years that actually have data so the UI can offer a year picker. Defaults to
// the most recent year with transactions (so a one-off backfill of, say, all of
// 2025 shows up even when "today" is in 2026).
router.get('/monthly', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId;

    const yearsRes = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`SELECT DISTINCT YEAR(date) AS y FROM transactions WHERE user_id = @userId ORDER BY y DESC`);
    const availableYears = (yearsRes.recordset as { y: number }[]).map((r) => r.y);

    const requestedYear = Number(req.query.year);
    const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
      ? requestedYear
      : (availableYears[0] ?? new Date().getFullYear());

    const yearStart = new Date(year, 0, 1);

    const [rows, netWorthRes, flowRes] = await Promise.all([
      pool.request()
        .input('userId', sql.Int, userId)
        .input('year', sql.Int, year)
        .query(`
          SELECT
            MONTH(t.date) AS m,
            SUM(${SPEND_AMOUNT})  AS spending,
            SUM(${INCOME_AMOUNT}) AS income
          FROM transactions t
          LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.user_id = @userId AND YEAR(t.date) = @year
          GROUP BY MONTH(t.date)
        `),

      // The user's *real* current net worth — computed the same way the dashboard
      // does: liquid cash (checking + savings, preferring linked/real balances and
      // excluding HSAs) minus credit-card debt. We anchor the per-month net-worth
      // trend to this so the latest month matches the dashboard exactly, instead
      // of a from-zero cash-flow tally that ignores starting balances.
      pool.request()
        .input('userId', sql.Int, userId)
        .query(`
          WITH acct AS (
            SELECT a.id, a.type, a.name, a.current_balance,
              ISNULL((SELECT SUM(CASE WHEN t.is_historical = 0
                                      THEN (CASE WHEN t.type='credit' THEN t.amount ELSE -t.amount END)
                                      ELSE 0 END)
                      FROM transactions t WHERE t.account_id = a.id AND t.user_id = @userId), 0) AS derived
            FROM accounts a WHERE a.user_id = @userId
          ),
          checking AS (SELECT * FROM acct WHERE type LIKE '%check%' OR name LIKE '%check%'),
          savings  AS (SELECT * FROM acct WHERE (type LIKE '%saving%' OR name LIKE '%saving%')
                         AND CONCAT(type,' ',name) NOT LIKE '%hsa%'
                         AND CONCAT(type,' ',name) NOT LIKE '%health saving%'),
          credit   AS (SELECT * FROM acct WHERE type = 'credit')
          SELECT
            (CASE WHEN EXISTS(SELECT 1 FROM checking WHERE current_balance IS NOT NULL)
                  THEN (SELECT ISNULL(SUM(current_balance),0) FROM checking WHERE current_balance IS NOT NULL)
                  ELSE (SELECT ISNULL(SUM(derived),0) FROM checking) END)
            + (CASE WHEN EXISTS(SELECT 1 FROM savings WHERE current_balance IS NOT NULL)
                  THEN (SELECT ISNULL(SUM(current_balance),0) FROM savings WHERE current_balance IS NOT NULL)
                  ELSE (SELECT ISNULL(SUM(derived),0) FROM savings) END)
            - (SELECT ISNULL(SUM(CASE WHEN current_balance IS NOT NULL
                                      THEN (CASE WHEN current_balance > 0 THEN current_balance ELSE 0 END)
                                      ELSE (CASE WHEN -derived > 0 THEN -derived ELSE 0 END) END), 0) FROM credit)
            AS netWorth
        `),

      // Net cash flow (income − spending) for everything from this year onward,
      // so we can back the anchor out to the start of the year.
      pool.request()
        .input('userId', sql.Int, userId)
        .input('yearStart', sql.Date, yearStart)
        .query(`
          SELECT ISNULL(SUM(${INCOME_AMOUNT}) - SUM(${SPEND_AMOUNT}), 0) AS flow
          FROM transactions t
          LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.user_id = @userId AND t.date >= @yearStart
        `),
    ]);

    const byMonth = new Map<number, { spending: number; income: number }>();
    for (const r of rows.recordset as { m: number; spending: number; income: number }[]) {
      byMonth.set(r.m, { spending: r.spending ?? 0, income: r.income ?? 0 });
    }

    const currentNetWorth = (netWorthRes.recordset[0] as { netWorth: number } | undefined)?.netWorth ?? 0;
    const flowFromYearStart = (flowRes.recordset[0] as { flow: number } | undefined)?.flow ?? 0;
    // Seed so that, after adding this year's monthly flows, the latest month lands
    // on the real current net worth (currentNetWorth = base + flowFromYearStart).
    const base = currentNetWorth - flowFromYearStart;

    // Zero-fill every month Jan–Dec so the chart/table always shows 12 columns.
    // netWorth is the running balance anchored to the real current net worth.
    let runningNetWorth = base;
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const hit = byMonth.get(m) ?? { spending: 0, income: 0 };
      const net = hit.income - hit.spending;
      runningNetWorth += net;
      return {
        monthKey: `${year}-${String(m).padStart(2, '0')}`,
        label: new Date(year, i, 1).toLocaleString('en-US', { month: 'short' }),
        spending: hit.spending,
        income: hit.income,
        net,
        netWorth: runningNetWorth,
      };
    });

    res.json({ year, availableYears, months });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load monthly breakdown' });
  }
});

export default router;

import { Router, Response } from 'express';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';
import { SPEND_AMOUNT, INCOME_AMOUNT } from '../config/spending';
import { generateSavingsSplit, SavingsSplitGoal } from '../services/aiService';

const router = Router();

// "Pay yourself first": this share of each month's leftover is auto-reserved into
// the built-in Savings bucket before any purchase goal can be funded.
const RESERVE_PCT = 0.20;

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// This month's income and net savings (income - spending) — the SAME figures the
// dashboard shows. Income drives the "pay yourself first" reserve target; net is
// the new money actually available to allocate.
async function monthTotals(userId: number): Promise<{ income: number; net: number }> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const res = await getPool().request()
    .input('userId', sql.Int, userId)
    .input('start', sql.Date, startOfMonth)
    .query(`
      SELECT SUM(${SPEND_AMOUNT}) AS spending, SUM(${INCOME_AMOUNT}) AS income
      FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = @userId AND t.date >= @start
    `);
  const r = res.recordset[0] as { spending: number | null; income: number | null } | undefined;
  const income = Number(r?.income) || 0;
  return { income, net: income - (Number(r?.spending) || 0) };
}

// The REAL money you've moved into savings, straight from the 'Savings' category
// on your bank transactions (deposits in, withdrawals out). This is the ground
// truth the whole page reconciles against — not the manual contribution ledger.
async function actualSavings(userId: number): Promise<{ thisMonth: number; lifetime: number }> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const res = await getPool().request()
    .input('userId', sql.Int, userId)
    .input('start', sql.Date, startOfMonth)
    .query(`
      SELECT
        ISNULL(SUM(CASE WHEN t.date >= @start
                        THEN (CASE WHEN t.type='debit' THEN t.amount ELSE -t.amount END)
                        ELSE 0 END), 0) AS thisMonth,
        ISNULL(SUM(CASE WHEN t.type='debit' THEN t.amount ELSE -t.amount END), 0) AS lifetime
      FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = @userId AND c.name = 'Savings'
    `);
  const row = res.recordset[0] as { thisMonth: number; lifetime: number };
  return { thisMonth: round2(Number(row.thisMonth)), lifetime: round2(Number(row.lifetime)) };
}

// Ensure the user's single built-in Savings (reserve) bucket exists and return its id.
async function ensureReserveGoal(userId: number): Promise<number> {
  const pool = getPool();
  await pool.request()
    .input('userId', sql.Int, userId)
    .query(`
      INSERT INTO savings_goals (user_id, name, target_amount, is_reserve, icon, color, priority)
      SELECT @userId, 'Savings', 0, 1, 'savings', '#22C55E', 9999
      WHERE NOT EXISTS (SELECT 1 FROM savings_goals WHERE user_id = @userId AND is_reserve = 1)
    `);
  const res = await pool.request()
    .input('userId', sql.Int, userId)
    .query(`SELECT TOP 1 id FROM savings_goals WHERE user_id = @userId AND is_reserve = 1`);
  return res.recordset[0].id as number;
}

// Per-month allocation snapshot used by GET / suggest / apply so they all agree.
async function monthlyState(userId: number, reserveId: number) {
  const mk = currentMonthKey();
  const [{ income, net }, saved] = await Promise.all([
    monthTotals(userId),
    actualSavings(userId),
  ]);

  const res = await getPool().request()
    .input('userId', sql.Int, userId)
    .input('mk', sql.Char(7), mk)
    .input('reserveId', sql.Int, reserveId)
    .query(`
      SELECT
        ISNULL(SUM(CASE WHEN goal_id <> @reserveId AND month_key = @mk THEN amount ELSE 0 END), 0) AS othersThisMonth,
        ISNULL(SUM(CASE WHEN goal_id <> @reserveId THEN amount ELSE 0 END), 0) AS othersLifetime
      FROM savings_contributions
      WHERE user_id = @userId
    `);
  const row = res.recordset[0] as { othersThisMonth: number; othersLifetime: number };
  const othersThisMonth = Number(row.othersThisMonth);
  const othersLifetime = Number(row.othersLifetime);

  // "Pay yourself first" reserve target = 20% of this month's INCOME (not of the
  // leftover), so the recommendation is a straight 20% of what you earned.
  const reserveTarget = round2(Math.max(0, income) * RESERVE_PCT);
  // The reserve is funded by REAL savings deposits this month, not a manual ledger.
  const reserveThisMonth = saved.thisMonth;
  const reserveRemaining = Math.max(0, round2(reserveTarget - reserveThisMonth));

  // "Available for goals" is a STOCK: the real money sitting in savings that
  // hasn't been earmarked to a specific purchase goal yet.
  const availableForGoals = Math.max(0, round2(saved.lifetime - othersLifetime));
  // The monthly flow pot the AI split works from (80% of this month's net, less
  // what's already allocated) — kept for the "split this month's leftover" tool.
  const available = Math.max(0, round2(net - reserveTarget - othersThisMonth));

  return {
    income,
    net,
    savedThisMonth: saved.thisMonth,
    savedLifetime: saved.lifetime,
    reserveTarget,
    reserveThisMonth,
    reserveRemaining,
    othersThisMonth,
    othersLifetime,
    availableForGoals,
    available,
  };
}

// GET /api/goals — purchase goals, the Savings reserve bucket, and how much of
// this month's net savings is still available to allocate (the 80% pot).
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const reserveId = await ensureReserveGoal(userId);

    const [goalsRes, state] = await Promise.all([
      getPool().request()
        .input('userId', sql.Int, userId)
        .query(`
          SELECT g.id, g.name, g.target_amount AS targetAmount,
                 g.target_date AS targetDate, g.icon, g.color, g.priority,
                 ISNULL(SUM(sc.amount), 0) AS saved
          FROM savings_goals g
          LEFT JOIN savings_contributions sc ON sc.goal_id = g.id
          WHERE g.user_id = @userId AND g.is_reserve = 0
          GROUP BY g.id, g.name, g.target_amount, g.target_date, g.icon, g.color, g.priority, g.created_at
          ORDER BY g.priority DESC, g.created_at
        `),
      monthlyState(userId, reserveId),
    ]);

    const goals = goalsRes.recordset.map((g) => {
      const target = Number(g.targetAmount);
      const saved = Number(g.saved);
      return {
        id: g.id as number,
        name: g.name as string,
        target,
        saved,
        remaining: Math.max(0, target - saved),
        pct: target > 0 ? (saved / target) * 100 : 0,
        targetDate: g.targetDate ? new Date(g.targetDate as Date).toISOString().slice(0, 10) : null,
        icon: g.icon as string | null,
        color: g.color as string | null,
        priority: Number(g.priority),
      };
    });

    res.json({
      goals,
      reserve: {
        id: reserveId,
        // Real money in savings (from the 'Savings' category), not a manual ledger.
        savedLifetime: state.savedLifetime,
        savedThisMonth: state.reserveThisMonth,
        targetThisMonth: state.reserveTarget,
        remainingThisMonth: state.reserveRemaining,
        pct: state.reserveTarget > 0
          ? Math.min(100, (state.reserveThisMonth / state.reserveTarget) * 100)
          : (state.reserveThisMonth > 0 ? 100 : 0),
      },
      summary: {
        totalSaved: goals.reduce((a, g) => a + g.saved, 0),
        totalTarget: goals.reduce((a, g) => a + g.target, 0),
      },
      reservePct: RESERVE_PCT,
      netSavings: state.net,
      // The real savings stock and how much of it is free to put toward goals.
      inSavings: state.savedLifetime,
      savedThisMonth: state.savedThisMonth,
      availableForGoals: state.availableForGoals,
      allocatedToOthersThisMonth: state.othersThisMonth,
      available: state.available,
      // Reminder to actually move money into savings: fires when this month's real
      // savings deposits fall short of your 20% "pay yourself first" target.
      moveReminder: {
        needed: state.reserveRemaining,
        savedThisMonth: state.savedThisMonth,
        targetThisMonth: state.reserveTarget,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load savings goals' });
  }
});

// POST /api/goals — create a purchase goal { name, target, targetDate?, icon?, color?, priority? }
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, target, targetDate, icon, color, priority } = req.body as {
      name?: unknown; target?: unknown; targetDate?: unknown;
      icon?: unknown; color?: unknown; priority?: unknown;
    };
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const tgt = Number(target);
    if (!cleanName || !Number.isFinite(tgt) || tgt <= 0) {
      res.status(400).json({ error: 'A name and a positive target amount are required' });
      return;
    }
    const result = await getPool().request()
      .input('userId', sql.Int, req.userId)
      .input('name', sql.NVarChar(150), cleanName)
      .input('target', sql.Decimal(12, 2), tgt)
      .input('date', sql.Date, targetDate ? new Date(String(targetDate)) : null)
      .input('icon', sql.NVarChar(50), typeof icon === 'string' ? icon : null)
      .input('color', sql.NVarChar(20), typeof color === 'string' ? color : null)
      .input('priority', sql.Int, Number.isFinite(Number(priority)) ? Number(priority) : 0)
      .query(`
        INSERT INTO savings_goals (user_id, name, target_amount, target_date, icon, color, priority, is_reserve)
        OUTPUT INSERTED.id
        VALUES (@userId, @name, @target, @date, @icon, @color, @priority, 0)
      `);
    res.json({ success: true, id: result.recordset[0].id as number });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// PUT /api/goals/:id — update a purchase goal (the reserve bucket isn't editable).
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id ?? '0');
    if (!id) {
      res.status(400).json({ error: 'Invalid goal id' });
      return;
    }
    const { name, target, targetDate, icon, color, priority } = req.body as {
      name?: unknown; target?: unknown; targetDate?: unknown;
      icon?: unknown; color?: unknown; priority?: unknown;
    };
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const tgt = Number(target);
    if (!cleanName || !Number.isFinite(tgt) || tgt <= 0) {
      res.status(400).json({ error: 'A name and a positive target amount are required' });
      return;
    }
    await getPool().request()
      .input('userId', sql.Int, req.userId)
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar(150), cleanName)
      .input('target', sql.Decimal(12, 2), tgt)
      .input('date', sql.Date, targetDate ? new Date(String(targetDate)) : null)
      .input('icon', sql.NVarChar(50), typeof icon === 'string' ? icon : null)
      .input('color', sql.NVarChar(20), typeof color === 'string' ? color : null)
      .input('priority', sql.Int, Number.isFinite(Number(priority)) ? Number(priority) : 0)
      .query(`
        UPDATE savings_goals
        SET name = @name, target_amount = @target, target_date = @date,
            icon = @icon, color = @color, priority = @priority
        WHERE id = @id AND user_id = @userId AND is_reserve = 0
      `);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// DELETE /api/goals/:id — remove a purchase goal and its history (reserve protected).
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id ?? '0');
    const pool = getPool();
    const guard = await pool.request()
      .input('userId', sql.Int, req.userId).input('id', sql.Int, id)
      .query(`SELECT is_reserve FROM savings_goals WHERE id = @id AND user_id = @userId`);
    if (guard.recordset[0]?.is_reserve) {
      res.status(400).json({ error: 'The Savings bucket cannot be deleted.' });
      return;
    }
    const tx = pool.transaction();
    await tx.begin();
    try {
      await tx.request()
        .input('userId', sql.Int, req.userId).input('id', sql.Int, id)
        .query(`DELETE FROM savings_contributions WHERE user_id = @userId AND goal_id = @id`);
      await tx.request()
        .input('userId', sql.Int, req.userId).input('id', sql.Int, id)
        .query(`DELETE FROM savings_goals WHERE user_id = @userId AND id = @id`);
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

// POST /api/goals/reserve/fund — set aside this month's 20% into the Savings
// bucket without touching other goals.
// The reserve is now funded automatically by real 'Savings' deposits, so this is
// informational only — it reports how much more you still need to move this month.
router.post('/reserve/fund', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const reserveId = await ensureReserveGoal(userId);
    const state = await monthlyState(userId, reserveId);
    res.json({ success: true, funded: 0, needed: state.reserveRemaining });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read savings reserve' });
  }
});

// POST /api/goals/suggest — ask the AI to split the available 80% across purchase
// goals. Returns a plan for review; nothing is saved until /apply.
router.post('/suggest', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const reserveId = await ensureReserveGoal(userId);
    const [goalsRes, state] = await Promise.all([
      getPool().request()
        .input('userId', sql.Int, userId)
        .query(`
          SELECT g.id, g.name, g.target_amount AS targetAmount, g.target_date AS targetDate,
                 g.icon, g.color, g.priority, ISNULL(SUM(sc.amount), 0) AS saved
          FROM savings_goals g
          LEFT JOIN savings_contributions sc ON sc.goal_id = g.id
          WHERE g.user_id = @userId AND g.is_reserve = 0
          GROUP BY g.id, g.name, g.target_amount, g.target_date, g.icon, g.color, g.priority, g.created_at
          ORDER BY g.priority DESC, g.created_at
        `),
      monthlyState(userId, reserveId),
    ]);

    const goals = goalsRes.recordset.map((g) => ({
      id: g.id as number,
      name: g.name as string,
      target: Number(g.targetAmount),
      saved: Number(g.saved),
      remaining: Math.max(0, Number(g.targetAmount) - Number(g.saved)),
      targetDate: g.targetDate ? new Date(g.targetDate as Date).toISOString().slice(0, 10) : null,
      icon: g.icon as string | null,
      color: g.color as string | null,
      priority: Number(g.priority),
    }));

    if (goals.length === 0) {
      res.json({ plan: [], available: state.availableForGoals });
      return;
    }

    const splitInput: SavingsSplitGoal[] = goals.map((g) => ({
      goalId: g.id, name: g.name, remaining: g.remaining, targetDate: g.targetDate, priority: g.priority,
    }));
    const split = await generateSavingsSplit(userId, splitInput, state.availableForGoals);
    const byId = new Map(split.map((s) => [s.goalId, s]));

    const plan = goals.map((g) => ({
      goalId: g.id, name: g.name, icon: g.icon, color: g.color,
      remaining: g.remaining,
      suggestedAmount: byId.get(g.id)?.suggestedAmount ?? 0,
      note: byId.get(g.id)?.note ?? '',
    }));

    res.json({ plan, available: state.availableForGoals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate savings split' });
  }
});

// POST /api/goals/apply — commit an allocation to purchase goals { items: [{ goalId, amount }] }.
// Tops up this month's 20% Savings reserve FIRST, then records the other
// allocations. Enforces that the others stay within the available 80%.
router.post('/apply', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const reserveId = await ensureReserveGoal(userId);
    const { items } = req.body as { items?: { goalId?: unknown; amount?: unknown }[] };
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'items must be a non-empty array' });
      return;
    }

    const clean = items
      .map((i) => ({ goalId: Number(i.goalId), amount: Number(i.amount) }))
      .filter((i) => Number.isInteger(i.goalId) && i.goalId > 0 && i.goalId !== reserveId
        && Number.isFinite(i.amount) && i.amount > 0);

    if (clean.length === 0) {
      res.status(400).json({ error: 'no valid allocations provided' });
      return;
    }

    const state = await monthlyState(userId, reserveId);
    const total = clean.reduce((a, i) => a + i.amount, 0);
    // You can only earmark money you've actually saved (the real savings stock
    // that isn't already committed to another goal).
    if (total > state.availableForGoals + 0.01) {
      res.status(400).json({
        error: `That earmarks $${total.toFixed(2)} but only $${state.availableForGoals.toFixed(2)} of your savings is available for goals.`,
      });
      return;
    }

    const pool = getPool();
    const mk = currentMonthKey();
    const tx = pool.transaction();
    await tx.begin();
    try {
      for (const i of clean) {
        await tx.request()
          .input('userId', sql.Int, userId)
          .input('goalId', sql.Int, i.goalId)
          .input('amount', sql.Decimal(12, 2), i.amount)
          .input('mk', sql.Char(7), mk)
          .query(`
            INSERT INTO savings_contributions (user_id, goal_id, amount, month_key)
            SELECT @userId, @goalId, @amount, @mk
            WHERE EXISTS (SELECT 1 FROM savings_goals WHERE id = @goalId AND user_id = @userId AND is_reserve = 0)
          `);
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    res.json({ success: true, applied: clean.length, total, reserved: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to apply allocation' });
  }
});

export default router;

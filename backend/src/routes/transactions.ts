import { Router, Response } from 'express';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/transactions
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const { category, account, search, startDate, endDate, limit = '100', offset = '0' } = req.query;

    const rawLimit  = parseInt(limit  as string);
    const rawOffset = parseInt(offset as string);
    const safeLimit  = isNaN(rawLimit)  || rawLimit  < 1 ? 100 : Math.min(rawLimit,  1000);
    const safeOffset = isNaN(rawOffset) || rawOffset < 0 ? 0   : rawOffset;

    const request = pool.request()
      .input('userId', sql.Int, req.userId)
      .input('lim',    sql.Int, safeLimit)
      .input('off',    sql.Int, safeOffset);

    let where = 'WHERE t.user_id = @userId';

    if (category) {
      where += ' AND c.name = @category';
      request.input('category', sql.NVarChar(100), category as string);
    }
    if (account) {
      where += ' AND t.account_id = @accountId';
      request.input('accountId', sql.Int, parseInt(account as string));
    }
    if (search) {
      where += ' AND (t.description LIKE @search OR t.merchant LIKE @search)';
      request.input('search', sql.NVarChar(500), `%${search}%`);
    }
    if (startDate) {
      where += ' AND t.date >= @startDate';
      request.input('startDate', sql.Date, new Date(startDate as string));
    }
    if (endDate) {
      where += ' AND t.date <= @endDate';
      request.input('endDate', sql.Date, new Date(endDate as string));
    }

    const result = await request.query(`
      SELECT
        t.id, t.date, t.description, t.merchant, t.amount, t.type,
        t.notes, t.is_recurring, t.created_at,
        c.name  AS category,      c.icon  AS category_icon, c.color AS category_color,
        a.name  AS account_name,  a.institution
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts   a ON t.account_id  = a.id
      ${where}
      ORDER BY t.date DESC
      OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY
    `);

    const countReq = pool.request().input('userId', sql.Int, req.userId);
    if (category)  countReq.input('category',  sql.NVarChar(100), category as string);
    if (account)   countReq.input('accountId', sql.Int,           parseInt(account as string));
    if (search)    countReq.input('search',    sql.NVarChar(500), `%${search}%`);
    if (startDate) countReq.input('startDate', sql.Date,          new Date(startDate as string));
    if (endDate)   countReq.input('endDate',   sql.Date,          new Date(endDate   as string));

    const countRes = await countReq.query(`
      SELECT COUNT(*) AS total
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts   a ON t.account_id  = a.id
      ${where}
    `);

    res.json({
      transactions: result.recordset,
      total: (countRes.recordset[0] as { total: number }).total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// PUT /api/transactions/bulk/categorize — bulk re-categorize
// NOTE: must be registered BEFORE the dynamic '/:id' route, otherwise Express
// matches "bulk" as an :id and this endpoint never runs.
router.put('/bulk/categorize', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const { ids, categoryId } = req.body as { ids: unknown; categoryId: unknown };

    if (!Array.isArray(ids) || ids.length === 0 || !Number.isInteger(categoryId) || (categoryId as number) < 1) {
      res.status(400).json({ error: 'ids must be a non-empty array and categoryId must be a valid integer' });
      return;
    }

    const safeIds = (ids as unknown[]).filter(id => Number.isInteger(id) && (id as number) > 0) as number[];
    if (safeIds.length === 0) {
      res.status(400).json({ error: 'No valid transaction ids provided' });
      return;
    }

    let updated = 0;
    for (const id of safeIds) {
      const result = await pool.request()
        .input('id',         sql.Int, id)
        .input('userId',     sql.Int, req.userId)
        .input('categoryId', sql.Int, categoryId as number)
        .query(`UPDATE transactions SET category_id = @categoryId WHERE id = @id AND user_id = @userId`);
      updated += result.rowsAffected[0] ?? 0;
    }

    res.json({ success: true, updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bulk update failed' });
  }
});

// PUT /api/transactions/:id  — update category, notes, merchant
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const id = parseInt(req.params.id ?? '0');
    const { categoryId, notes, merchant } = req.body as {
      categoryId?: number; notes?: string; merchant?: string;
    };

    const updateRes = await pool.request()
      .input('id',         sql.Int,            id)
      .input('userId',     sql.Int,            req.userId)
      .input('categoryId', sql.Int,            categoryId ?? null)
      .input('notes',      sql.NVarChar(1000), notes    ?? null)
      .input('merchant',   sql.NVarChar(200),  merchant ?? null)
      .query(`
        UPDATE transactions SET
          category_id = COALESCE(@categoryId, category_id),
          notes       = COALESCE(@notes,      notes),
          merchant    = COALESCE(@merchant,   merchant)
        WHERE id = @id AND user_id = @userId
      `);

    if ((updateRes.rowsAffected[0] ?? 0) === 0) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    // Learn the merchant → category mapping for this user
    if (merchant && categoryId) {
      await pool.request()
        .input('userId',     sql.Int,           req.userId)
        .input('pattern',    sql.NVarChar(200), merchant)
        .input('categoryId', sql.Int,           categoryId)
        .query(`
          IF EXISTS (SELECT 1 FROM merchant_rules WHERE merchant_pattern = @pattern AND user_id = @userId)
            UPDATE merchant_rules SET category_id = @categoryId WHERE merchant_pattern = @pattern AND user_id = @userId
          ELSE
            INSERT INTO merchant_rules (user_id, merchant_pattern, category_id) VALUES (@userId, @pattern, @categoryId)
        `);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

export default router;

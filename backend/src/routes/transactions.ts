import { Router, Response, Request as ExpressRequest } from 'express';
import type { Request as SqlRequest } from 'mssql';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';
import { categoryUsableByUser } from '../services/categoryAccess';

const router = Router();

// Shared by the list, count, and CSV-export queries so all three honour the
// exact same filters. Binds the filter inputs on the given request and returns
// the WHERE clause to splice into the query.
function applyTransactionFilters(request: SqlRequest, query: ExpressRequest['query']): string {
  const { category, account, search, startDate, endDate } = query;
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
  return where;
}

// GET /api/transactions
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const { limit = '100', offset = '0' } = req.query;

    const rawLimit  = parseInt(limit  as string);
    const rawOffset = parseInt(offset as string);
    const safeLimit  = isNaN(rawLimit)  || rawLimit  < 1 ? 100 : Math.min(rawLimit,  1000);
    const safeOffset = isNaN(rawOffset) || rawOffset < 0 ? 0   : rawOffset;

    const request = pool.request()
      .input('userId', sql.Int, req.userId)
      .input('lim',    sql.Int, safeLimit)
      .input('off',    sql.Int, safeOffset);

    const where = applyTransactionFilters(request, req.query);

    const result = await request.query(`
      SELECT
        t.id, t.date, t.description, t.merchant, t.amount, t.type,
        t.notes, t.is_recurring, t.created_at, t.reimburses_transaction_id,
        c.name  AS category,      c.icon  AS category_icon, c.color AS category_color,
        a.name  AS account_name,  a.institution,
        -- Total reimbursed against this expense (0 when nothing is linked), so the
        -- UI can show gross vs true net.
        (SELECT ISNULL(SUM(r.amount), 0) FROM transactions r
          WHERE r.reimburses_transaction_id = t.id AND r.user_id = @userId) AS reimbursed_amount
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts   a ON t.account_id  = a.id
      ${where}
      ORDER BY t.date DESC
      OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY
    `);

    const countReq = pool.request().input('userId', sql.Int, req.userId);
    applyTransactionFilters(countReq, req.query);

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

// GET /api/transactions/months — distinct months that have transactions,
// newest first, with a count. Powers the "group by month" filter dropdown.
router.get('/months', async (req: AuthRequest, res: Response) => {
  try {
    const result = await getPool().request()
      .input('userId', sql.Int, req.userId)
      .query(`
        SELECT FORMAT(t.date, 'yyyy-MM') AS monthKey, COUNT(*) AS count
        FROM transactions t
        WHERE t.user_id = @userId
        GROUP BY FORMAT(t.date, 'yyyy-MM')
        ORDER BY monthKey DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transaction months' });
  }
});

// Quote/escape a value for a CSV cell. Text cells that look like a spreadsheet
// formula (=, +, -, @, tab) get a leading apostrophe so Excel/Sheets render
// them as text instead of executing them.
function csvField(value: string | null | undefined): string {
  if (value == null) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// GET /api/transactions/export — download transactions as a CSV file.
// Honours the same filters as the list endpoint but never paginates: it
// exports every matching row. Amounts are signed (debits negative) so the
// column sums correctly in a spreadsheet; the Type column keeps the raw kind.
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const request = getPool().request().input('userId', sql.Int, req.userId);
    const where = applyTransactionFilters(request, req.query);

    const result = await request.query(`
      SELECT
        t.date, t.description, t.merchant, t.amount, t.type, t.notes,
        c.name AS category, a.name AS account_name, a.institution
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts   a ON t.account_id  = a.id
      ${where}
      ORDER BY t.date DESC, t.id DESC
    `);

    const rows = result.recordset as Array<{
      date: Date; description: string; merchant: string | null; amount: number;
      type: string; notes: string | null; category: string | null;
      account_name: string | null; institution: string | null;
    }>;

    const lines = ['Date,Description,Merchant,Category,Account,Institution,Type,Amount,Notes'];
    for (const row of rows) {
      lines.push([
        // DATE columns come back as JS Dates at UTC midnight, so the ISO slice
        // is the stored calendar date with no timezone drift.
        row.date.toISOString().slice(0, 10),
        csvField(row.description),
        csvField(row.merchant),
        csvField(row.category ?? 'Unknown'),
        csvField(row.account_name),
        csvField(row.institution),
        row.type,
        (row.type === 'credit' ? row.amount : -row.amount).toFixed(2),
        csvField(row.notes),
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="breadbank-transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    // BOM so Excel detects UTF-8 (merchant names can contain non-ASCII).
    res.send('\uFEFF' + lines.join('\r\n'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export transactions' });
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

    if (!(await categoryUsableByUser(req.userId!, categoryId as number))) {
      res.status(404).json({ error: 'Category not found' });
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

    // Learn a merchant→category rule for each distinct merchant in the batch so
    // future imports of those merchants are auto-filed into this category.
    const merchReq = pool.request().input('userId', sql.Int, req.userId);
    safeIds.forEach((id, i) => merchReq.input(`m${i}`, sql.Int, id));
    const merchants = (await merchReq.query(`
      SELECT DISTINCT merchant FROM transactions
      WHERE user_id = @userId AND id IN (${safeIds.map((_, i) => `@m${i}`).join(',')})
        AND merchant IS NOT NULL AND merchant <> ''
    `)).recordset as { merchant: string }[];
    for (const { merchant } of merchants) {
      await pool.request()
        .input('userId', sql.Int, req.userId)
        .input('pattern', sql.NVarChar(200), merchant)
        .input('categoryId', sql.Int, categoryId as number)
        .query(`
          IF EXISTS (SELECT 1 FROM merchant_rules WHERE merchant_pattern = @pattern AND user_id = @userId)
            UPDATE merchant_rules SET category_id = @categoryId WHERE merchant_pattern = @pattern AND user_id = @userId
          ELSE
            INSERT INTO merchant_rules (user_id, merchant_pattern, category_id) VALUES (@userId, @pattern, @categoryId)
        `);
    }

    res.json({ success: true, updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bulk update failed' });
  }
});

// PUT /api/transactions/reclassify-merchant  { merchant, categoryId }
// Retroactively move every transaction from a given merchant into a category,
// and learn the rule so future imports follow suit. Registered before '/:id'.
router.put('/reclassify-merchant', async (req: AuthRequest, res: Response) => {
  try {
    const { merchant, categoryId } = req.body as { merchant?: unknown; categoryId?: unknown };
    const cat = Number(categoryId);
    if (typeof merchant !== 'string' || !merchant.trim() || !Number.isInteger(cat) || cat < 1) {
      res.status(400).json({ error: 'merchant and a valid categoryId are required' });
      return;
    }
    if (!(await categoryUsableByUser(req.userId!, cat))) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    const pool = getPool();

    const upd = await pool.request()
      .input('userId', sql.Int, req.userId)
      .input('merchant', sql.NVarChar(200), merchant.trim())
      .input('categoryId', sql.Int, cat)
      .query(`UPDATE transactions SET category_id = @categoryId WHERE user_id = @userId AND merchant = @merchant`);

    await pool.request()
      .input('userId', sql.Int, req.userId)
      .input('pattern', sql.NVarChar(200), merchant.trim())
      .input('categoryId', sql.Int, cat)
      .query(`
        IF EXISTS (SELECT 1 FROM merchant_rules WHERE merchant_pattern = @pattern AND user_id = @userId)
          UPDATE merchant_rules SET category_id = @categoryId WHERE merchant_pattern = @pattern AND user_id = @userId
        ELSE
          INSERT INTO merchant_rules (user_id, merchant_pattern, category_id) VALUES (@userId, @pattern, @categoryId)
      `);

    res.json({ success: true, updated: upd.rowsAffected[0] ?? 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reclassify merchant' });
  }
});

// PUT /api/transactions/:id  — update category, notes, merchant
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const id = parseInt(req.params.id ?? '0');
    const rawCategoryId = (req.body as any)?.categoryId;
    const categoryId = rawCategoryId !== undefined && rawCategoryId !== null
      ? typeof rawCategoryId === 'object' && 'value' in rawCategoryId
        ? Number((rawCategoryId as any).value)
        : Number(rawCategoryId)
      : null;

    if (rawCategoryId !== undefined && rawCategoryId !== null && (Number.isNaN(categoryId) || !Number.isFinite(categoryId))) {
      res.status(400).json({ error: 'categoryId must be a valid number' });
      return;
    }

    const { notes, merchant, date } = req.body as { notes?: string; merchant?: string; date?: string };

    // Optional date override (e.g. a paycheck that posted a couple days early).
    // Accept a plain calendar date so no timezone shift occurs.
    if (date !== undefined && date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
      return;
    }

    if (categoryId !== null && !(await categoryUsableByUser(req.userId!, categoryId))) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    const updateRes = await pool.request()
      .input('id',         sql.Int,            id)
      .input('userId',     sql.Int,            req.userId)
      .input('categoryId', sql.Int,            categoryId ?? null)
      .input('notes',      sql.NVarChar(1000), notes    ?? null)
      .input('merchant',   sql.NVarChar(200),  merchant ?? null)
      .input('date',       sql.Date,           date     ?? null)
      .query(`
        UPDATE transactions SET
          category_id     = COALESCE(@categoryId, category_id),
          notes           = COALESCE(@notes,      notes),
          merchant        = COALESCE(@merchant,   merchant),
          date            = COALESCE(@date,       date),
          -- Mark the date as user-set so a later Plaid sync won't reset it.
          date_overridden = CASE WHEN @date IS NOT NULL THEN 1 ELSE date_overridden END
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

// GET /api/transactions/:id/reimbursements — for one expense, the reimbursements
// already linked to it plus the pool of unlinked reimbursements you can attach.
router.get('/:id/reimbursements', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id ?? '0');
    if (!id) { res.status(400).json({ error: 'Invalid transaction id' }); return; }
    const pool = getPool();

    const [linked, available] = await Promise.all([
      pool.request()
        .input('userId', sql.Int, req.userId).input('id', sql.Int, id)
        .query(`
          SELECT id, date, description, amount
          FROM transactions
          WHERE user_id = @userId AND reimburses_transaction_id = @id
          ORDER BY date DESC
        `),
      // The pool to pick from: credits still sitting in the Reimbursement bucket
      // (i.e. not yet attached to any expense).
      pool.request()
        .input('userId', sql.Int, req.userId)
        .query(`
          SELECT t.id, t.date, t.description, t.amount
          FROM transactions t JOIN categories c ON c.id = t.category_id
          WHERE t.user_id = @userId AND t.type = 'credit'
            AND c.name = 'Reimbursement' AND t.reimburses_transaction_id IS NULL
          ORDER BY t.date DESC
        `),
    ]);

    res.json({ linked: linked.recordset, available: available.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load reimbursements' });
  }
});

// PUT /api/transactions/:id/reimbursements  { reimbursementIds: number[] }
// Reconcile which reimbursements are attached to this expense. Attached ones are
// moved into the expense's category (so category/report totals net out); ones
// removed from the list go back to the Reimbursement bucket.
router.put('/:id/reimbursements', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id ?? '0');
    if (!id) { res.status(400).json({ error: 'Invalid transaction id' }); return; }
    const ids = Array.isArray((req.body as { reimbursementIds?: unknown }).reimbursementIds)
      ? ((req.body as { reimbursementIds: unknown[] }).reimbursementIds)
          .map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];

    const pool = getPool();
    // The expense must belong to the user; grab its category to move links into.
    const exp = await pool.request()
      .input('userId', sql.Int, req.userId).input('id', sql.Int, id)
      .query(`SELECT category_id FROM transactions WHERE id = @id AND user_id = @userId`);
    if (exp.recordset.length === 0) { res.status(404).json({ error: 'Transaction not found' }); return; }
    const expenseCategoryId = (exp.recordset[0] as { category_id: number | null }).category_id;

    const reimbursementCat = await pool.request()
      .query(`SELECT id FROM categories WHERE name = 'Reimbursement' AND user_id IS NULL`);
    const reimbursementCatId = (reimbursementCat.recordset[0] as { id: number } | undefined)?.id ?? null;

    const tx = pool.transaction();
    await tx.begin();
    try {
      // Unlink anything currently attached to this expense that's not in the new
      // list — send it back to the Reimbursement bucket.
      const unlinkReq = tx.request().input('userId', sql.Int, req.userId).input('id', sql.Int, id)
        .input('reimbCat', sql.Int, reimbursementCatId);
      let unlinkWhere = 'reimburses_transaction_id = @id AND user_id = @userId';
      if (ids.length) {
        unlinkWhere += ` AND id NOT IN (${ids.map((_, i) => `@k${i}`).join(',')})`;
        ids.forEach((v, i) => unlinkReq.input(`k${i}`, sql.Int, v));
      }
      await unlinkReq.query(`
        UPDATE transactions SET reimburses_transaction_id = NULL, category_id = @reimbCat
        WHERE ${unlinkWhere}
      `);

      // Link the selected reimbursements to this expense and move them into its
      // category. Guard so a user can only link their OWN reimbursement rows.
      for (const rid of ids) {
        await tx.request()
          .input('userId', sql.Int, req.userId).input('id', sql.Int, id)
          .input('rid', sql.Int, rid).input('cat', sql.Int, expenseCategoryId)
          .query(`
            UPDATE transactions
            SET reimburses_transaction_id = @id, category_id = @cat
            WHERE id = @rid AND user_id = @userId AND type = 'credit'
          `);
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    res.json({ success: true, linked: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update reimbursements' });
  }
});

export default router;

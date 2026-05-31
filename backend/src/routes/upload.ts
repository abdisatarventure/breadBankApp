import { Router, Response } from 'express';
import multer from 'multer';
import { parseCSV } from '../services/csvParser';
import { filterDuplicates } from '../services/duplicateDetector';
import { categorizeTransactions } from '../services/aiService';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';

const router  = Router();
const storage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/', storage.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  const originalName = req.file.originalname.toLowerCase();
  const allowedMimes = ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'];
  if (!originalName.endsWith('.csv') && !allowedMimes.includes(req.file.mimetype)) {
    res.status(400).json({ error: 'Only CSV files are accepted' });
    return;
  }

  const userId      = req.userId;
  const accountId   = parseInt(req.body.accountId   as string);
  const accountType = req.body.accountType as string;

  if (!accountId || isNaN(accountId) || !accountType) {
    res.status(400).json({ error: 'accountId and accountType are required' });
    return;
  }

  try {
    const pool       = getPool();
    const csvContent = req.file.buffer.toString('utf-8');

    // Verify the target account is one this user is allowed to write to
    // (their own, or a shared/seeded account). Prevents writing transactions
    // into another user's private account by guessing its id.
    const acctCheck = await pool.request()
      .input('accountId', sql.Int, accountId)
      .input('userId',    sql.Int, userId)
      .query(`SELECT id FROM accounts WHERE id = @accountId AND (user_id = @userId OR user_id IS NULL)`);
    if (acctCheck.recordset.length === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // 1. Parse
    const parsed = parseCSV(csvContent, accountType);
    if (parsed.length === 0) {
      res.status(400).json({ error: 'No valid transactions found in CSV' });
      return;
    }

    // 2. De-duplicate (scoped to this user's existing transactions)
    const { unique, duplicateCount } = await filterDuplicates(
      parsed.map(t => ({ ...t, accountId })),
      userId,
    );

    // 3. Split into known (merchant_rules) vs unknown
    const toInsert: Array<{ tx: typeof unique[0]; categoryId: number | null; merchant: string }> = [];
    const needsAI:  typeof unique = [];

    // Cache for category-name → id lookups during this upload
    const categoryIdCache = new Map<string, number | null>();
    // Parser hints and AI results only ever use the shared system category
    // names, so resolve against system categories (user_id IS NULL).
    const lookupCategoryId = async (name: string): Promise<number | null> => {
      if (categoryIdCache.has(name)) return categoryIdCache.get(name)!;
      const row = await pool.request()
        .input('name', sql.NVarChar(100), name)
        .query(`SELECT id FROM categories WHERE name = @name AND user_id IS NULL`);
      const id = (row.recordset[0] as { id: number } | undefined)?.id ?? null;
      categoryIdCache.set(name, id);
      return id;
    };

    for (const tx of unique) {
      // Parser already flagged this row (e.g. a credit-card payment or
      // internal transfer) — honor it and skip rules/AI entirely.
      if (tx.category) {
        const hintedId = await lookupCategoryId(tx.category);
        toInsert.push({ tx, categoryId: hintedId, merchant: tx.description });
        continue;
      }

      const rule = await pool.request()
        .input('userId', sql.Int,          userId)
        .input('desc',   sql.NVarChar(500), tx.description)
        .query(`
          SELECT TOP 1 category_id FROM merchant_rules
          WHERE user_id = @userId AND @desc LIKE '%' + merchant_pattern + '%'
          ORDER BY LEN(merchant_pattern) DESC
        `);

      const knownCatId = (rule.recordset[0] as { category_id: number } | undefined)?.category_id ?? null;
      if (knownCatId) {
        toInsert.push({ tx, categoryId: knownCatId, merchant: tx.description });
      } else {
        needsAI.push(tx);
      }
    }

    // 4. AI categorize unknowns in batches of 50
    const BATCH = 50;
    for (let i = 0; i < needsAI.length; i += BATCH) {
      const batch   = needsAI.slice(i, i + BATCH);
      const results = await categorizeTransactions(
        batch.map(t => ({ description: t.description, amount: t.amount })),
        accountType,
      );

      for (let j = 0; j < batch.length; j++) {
        const hit          = results.find(r => r.index === j);
        const categoryName = hit?.category ?? 'Unknown';
        const merchant     = hit?.merchant ?? batch[j]!.description;

        const categoryId = await lookupCategoryId(categoryName);

        toInsert.push({ tx: batch[j]!, categoryId, merchant });

        // Persist learned rule for this user (skip Unknown)
        if (categoryName !== 'Unknown' && merchant && categoryId) {
          await pool.request()
            .input('userId',     sql.Int,           userId)
            .input('pattern',    sql.NVarChar(200), merchant)
            .input('categoryId', sql.Int,           categoryId)
            .query(`
              IF NOT EXISTS (SELECT 1 FROM merchant_rules WHERE merchant_pattern = @pattern AND user_id = @userId)
                INSERT INTO merchant_rules (user_id, merchant_pattern, category_id) VALUES (@userId, @pattern, @categoryId)
            `);
        }
      }
    }

    // 5. Create upload record
    const uploadRow = await pool.request()
      .input('userId',           sql.Int,           userId)
      .input('accountId',        sql.Int,          accountId)
      .input('filename',         sql.NVarChar(500), req.file.originalname)
      .input('transactionCount', sql.Int,           toInsert.length)
      .input('duplicateCount',   sql.Int,           duplicateCount)
      .query(`
        INSERT INTO uploads (user_id, account_id, filename, transaction_count, duplicate_count)
        OUTPUT INSERTED.id VALUES (@userId, @accountId, @filename, @transactionCount, @duplicateCount)
      `);
    const uploadId = (uploadRow.recordset[0] as { id: number }).id;

    // 6. Insert transactions
    for (const { tx, categoryId, merchant } of toInsert) {
      await pool.request()
        .input('userId',     sql.Int,           userId)
        .input('accountId',  sql.Int,           accountId)
        .input('uploadId',   sql.Int,           uploadId)
        .input('date',       sql.Date,          tx.date)
        .input('description',sql.NVarChar(500), tx.description)
        .input('merchant',   sql.NVarChar(200), merchant)
        .input('amount',     sql.Decimal(12,2), tx.amount)
        .input('type',       sql.NVarChar(10),  tx.type)
        .input('categoryId', sql.Int,           categoryId)
        .query(`
          INSERT INTO transactions
            (user_id, account_id, upload_id, date, description, merchant, amount, type, category_id)
          VALUES
            (@userId, @accountId, @uploadId, @date, @description, @merchant, @amount, @type, @categoryId)
        `);
    }

    res.json({
      success:          true,
      imported:         toInsert.length,
      duplicatesSkipped: duplicateCount,
      total:            parsed.length,
    });

  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process CSV' });
  }
});

// GET /api/upload/history
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const pool   = getPool();
    const result = await pool.request()
      .input('userId', sql.Int, req.userId)
      .query(`
      SELECT u.id, u.filename, u.transaction_count, u.duplicate_count, u.created_at,
             a.name AS account_name, a.institution
      FROM uploads u JOIN accounts a ON u.account_id = a.id
      WHERE u.user_id = @userId
      ORDER BY u.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch upload history' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parseCSV } from '../services/csvParser';
import { filterDuplicates } from '../services/duplicateDetector';
import { categorizeTransactions } from '../services/aiService';
import { getPool, sql } from '../config/db';

const router  = Router();
const storage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/', storage.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  const accountId   = parseInt(req.body.accountId   as string);
  const accountType = req.body.accountType as string;

  if (!accountId || !accountType) {
    res.status(400).json({ error: 'accountId and accountType are required' });
    return;
  }

  try {
    const pool       = getPool();
    const csvContent = req.file.buffer.toString('utf-8');

    // 1. Parse
    const parsed = parseCSV(csvContent, accountType);
    if (parsed.length === 0) {
      res.status(400).json({ error: 'No valid transactions found in CSV' });
      return;
    }

    // 2. De-duplicate
    const { unique, duplicateCount } = await filterDuplicates(
      parsed.map(t => ({ ...t, accountId }))
    );

    // 3. Split into known (merchant_rules) vs unknown
    const toInsert: Array<{ tx: typeof unique[0]; categoryId: number | null; merchant: string }> = [];
    const needsAI:  typeof unique = [];

    for (const tx of unique) {
      const rule = await pool.request()
        .input('desc', sql.NVarChar(500), tx.description)
        .query(`
          SELECT TOP 1 category_id FROM merchant_rules
          WHERE @desc LIKE '%' + merchant_pattern + '%'
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
        batch.map(t => ({ description: t.description, amount: t.amount }))
      );

      for (let j = 0; j < batch.length; j++) {
        const hit          = results.find(r => r.index === j);
        const categoryName = hit?.category ?? 'Unknown';
        const merchant     = hit?.merchant ?? batch[j]!.description;

        const catRow = await pool.request()
          .input('name', sql.NVarChar(100), categoryName)
          .query(`SELECT id FROM categories WHERE name = @name`);
        const categoryId = (catRow.recordset[0] as { id: number } | undefined)?.id ?? null;

        toInsert.push({ tx: batch[j]!, categoryId, merchant });

        // Persist learned rule (skip Unknown)
        if (categoryName !== 'Unknown' && merchant && categoryId) {
          await pool.request()
            .input('pattern',    sql.NVarChar(200), merchant)
            .input('categoryId', sql.Int,           categoryId)
            .query(`
              IF NOT EXISTS (SELECT 1 FROM merchant_rules WHERE merchant_pattern = @pattern)
                INSERT INTO merchant_rules (merchant_pattern, category_id) VALUES (@pattern, @categoryId)
            `);
        }
      }
    }

    // 5. Create upload record
    const uploadRow = await pool.request()
      .input('accountId',        sql.Int,          accountId)
      .input('filename',         sql.NVarChar(500), req.file.originalname)
      .input('transactionCount', sql.Int,           toInsert.length)
      .input('duplicateCount',   sql.Int,           duplicateCount)
      .query(`
        INSERT INTO uploads (account_id, filename, transaction_count, duplicate_count)
        OUTPUT INSERTED.id VALUES (@accountId, @filename, @transactionCount, @duplicateCount)
      `);
    const uploadId = (uploadRow.recordset[0] as { id: number }).id;

    // 6. Insert transactions
    for (const { tx, categoryId, merchant } of toInsert) {
      await pool.request()
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
            (account_id, upload_id, date, description, merchant, amount, type, category_id)
          VALUES
            (@accountId, @uploadId, @date, @description, @merchant, @amount, @type, @categoryId)
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
router.get('/history', async (_req, res) => {
  try {
    const pool   = getPool();
    const result = await pool.request().query(`
      SELECT u.id, u.filename, u.transaction_count, u.duplicate_count, u.created_at,
             a.name AS account_name, a.institution
      FROM uploads u JOIN accounts a ON u.account_id = a.id
      ORDER BY u.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch upload history' });
  }
});

export default router;

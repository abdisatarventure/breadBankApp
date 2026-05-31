import { Router, Response } from 'express';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await getPool().request()
      .input('userId', sql.Int, req.userId)
      .query(`
        SELECT c.id, c.name, c.icon, c.color, c.is_system,
               COUNT(t.id) AS transaction_count
        FROM categories c
        LEFT JOIN transactions t ON t.category_id = c.id AND t.user_id = @userId
        WHERE c.user_id = @userId OR c.user_id IS NULL
        GROUP BY c.id, c.name, c.icon, c.color, c.is_system
        ORDER BY c.name
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, icon, color } = req.body as { name?: string; icon?: string; color?: string };

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Category name is required' });
      return;
    }
    if (name.trim().length > 100) {
      res.status(400).json({ error: 'Category name must be 100 characters or fewer' });
      return;
    }

    const result = await getPool().request()
      .input('userId', sql.Int,         req.userId)
      .input('name',  sql.NVarChar(100), name.trim())
      .input('icon',  sql.NVarChar(50),  icon  ?? 'label')
      .input('color', sql.NVarChar(20),  color ?? '#6C4ED4')
      .query(`
        INSERT INTO categories (user_id, name, icon, color, is_system)
        OUTPUT INSERTED.* VALUES (@userId, @name, @icon, @color, 0)
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// GET unknown transactions (needs manual categorization)
router.get('/unknown', async (req: AuthRequest, res: Response) => {
  try {
    const result = await getPool().request()
      .input('userId', sql.Int, req.userId)
      .query(`
        SELECT t.id, t.date, t.description, t.merchant, t.amount, t.type,
               a.name AS account_name
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.user_id = @userId AND c.name = 'Unknown'
        ORDER BY t.date DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch unknown transactions' });
  }
});

export default router;

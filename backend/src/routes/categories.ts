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

// DELETE /api/categories/:id — remove a user's custom category
// System categories (user_id IS NULL / is_system = 1) can't be deleted.
// Any transactions or merchant rules pointing at it are moved back to
// the shared 'Unknown' bucket so we never orphan a foreign key.
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id ?? '0', 10);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'Invalid category id' });
      return;
    }

    const pool = getPool();

    // Confirm the category exists, belongs to this user, and is deletable.
    const owned = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, req.userId)
      .query(`SELECT is_system FROM categories WHERE id = @id AND user_id = @userId`);

    if (owned.recordset.length === 0) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    if (owned.recordset[0].is_system) {
      res.status(403).json({ error: 'System categories cannot be deleted' });
      return;
    }

    // Reassign affected transactions to the shared 'Unknown' category.
    await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, req.userId)
      .query(`
        UPDATE transactions
        SET category_id = (SELECT TOP 1 id FROM categories WHERE name = 'Unknown' ORDER BY user_id)
        WHERE category_id = @id AND user_id = @userId
      `);

    // Drop any learned merchant rules that referenced this category.
    await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, req.userId)
      .query(`DELETE FROM merchant_rules WHERE category_id = @id AND user_id = @userId`);

    await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, req.userId)
      .query(`DELETE FROM categories WHERE id = @id AND user_id = @userId AND is_system = 0`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// PUT /api/categories/:id — update color/icon (any visible category; system
// categories are shared, so a recolor applies to every user) and name (own
// custom categories only).
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id ?? '0', 10);
    const { color, icon, name } = req.body as { color?: string; icon?: string; name?: string };
    if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: 'Invalid category id' }); return; }
    if (color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      res.status(400).json({ error: 'color must be a #rrggbb hex value' });
      return;
    }
    const pool = getPool();
    const owned = await pool.request()
      .input('id', sql.Int, id).input('userId', sql.Int, req.userId)
      .query('SELECT user_id FROM categories WHERE id = @id AND (user_id = @userId OR user_id IS NULL)');
    const row = owned.recordset[0] as { user_id: number | null } | undefined;
    if (!row) { res.status(404).json({ error: 'Category not found' }); return; }
    if (name !== undefined && row.user_id === null) {
      res.status(403).json({ error: 'System category names cannot be changed' });
      return;
    }
    await pool.request()
      .input('id', sql.Int, id)
      .input('color', sql.NVarChar(20), color ?? null)
      .input('icon', sql.NVarChar(50), icon ?? null)
      .input('name', sql.NVarChar(100), name?.trim() || null)
      .query(`UPDATE categories SET
                color = COALESCE(@color, color),
                icon  = COALESCE(@icon, icon),
                name  = COALESCE(@name, name)
              WHERE id = @id`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update category' });
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

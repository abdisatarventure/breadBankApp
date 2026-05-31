import { Router } from 'express';
import { getPool, sql } from '../config/db';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT c.id, c.name, c.icon, c.color, c.is_system,
             COUNT(t.id) AS transaction_count
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id
      GROUP BY c.id, c.name, c.icon, c.color, c.is_system
      ORDER BY c.name
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, icon, color } = req.body as { name: string; icon?: string; color?: string };
    const result = await getPool().request()
      .input('name',  sql.NVarChar(100), name)
      .input('icon',  sql.NVarChar(50),  icon  ?? 'label')
      .input('color', sql.NVarChar(20),  color ?? '#6C4ED4')
      .query(`
        INSERT INTO categories (name, icon, color, is_system)
        OUTPUT INSERTED.* VALUES (@name, @icon, @color, 0)
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// GET unknown transactions (needs manual categorization)
router.get('/unknown', async (_req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT t.id, t.date, t.description, t.merchant, t.amount, t.type,
             a.name AS account_name
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE c.name = 'Unknown'
      ORDER BY t.date DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch unknown transactions' });
  }
});

export default router;

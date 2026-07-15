import { Router, Response } from 'express';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const THEMES = ['original', 'black', 'midnight', 'gold', 'light', 'brown', 'sage', 'pink'];

// GET /api/settings — per-user UI preferences (currently just the theme).
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await getPool().request()
      .input('u', sql.Int, req.userId)
      .query(`SELECT setting_value FROM app_settings WHERE user_id = @u AND setting_key = 'theme'`);
    const theme = (result.recordset[0] as { setting_value: string } | undefined)?.setting_value;
    res.json({ theme: theme && THEMES.includes(theme) ? theme : 'original' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// PUT /api/settings/theme  { theme: 'original' | 'gold' | 'light' }
router.put('/theme', async (req: AuthRequest, res: Response) => {
  try {
    const { theme } = req.body as { theme?: unknown };
    if (typeof theme !== 'string' || !THEMES.includes(theme)) {
      res.status(400).json({ error: `theme must be one of: ${THEMES.join(', ')}` });
      return;
    }
    await getPool().request()
      .input('u', sql.Int, req.userId)
      .input('v', sql.NVarChar(50), theme)
      .query(`
        MERGE app_settings AS t
        USING (SELECT @u AS user_id, 'theme' AS setting_key) AS s
          ON t.user_id = s.user_id AND t.setting_key = s.setting_key
        WHEN MATCHED THEN UPDATE SET setting_value = @v
        WHEN NOT MATCHED THEN INSERT (user_id, setting_key, setting_value) VALUES (@u, 'theme', @v);
      `);
    res.json({ theme });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save theme' });
  }
});

export default router;

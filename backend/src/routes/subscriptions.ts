import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { detectSubscriptions } from '../services/subscriptionsService';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const subscriptions = await detectSubscriptions(req.userId!);
    const totalMonthly = Math.round(subscriptions.reduce((s, x) => s + x.monthlyCost, 0) * 100) / 100;

    res.json({
      subscriptions,
      summary: {
        count: subscriptions.length,
        totalMonthly,
        totalYearly: Math.round(totalMonthly * 12 * 100) / 100,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to detect subscriptions' });
  }
});

export default router;

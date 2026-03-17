import { Router } from 'express';
import { query } from '../services/db.js';

const router = Router();

// GET /api/logs — Get activity log for current user
router.get('/', async (req, res, next) => {
  try {
    let limit = parseInt(req.query.limit, 10) || 200;
    if (limit > 2000) limit = 2000;
    if (limit < 1) limit = 200;

    const { rows } = await query(
      'SELECT * FROM activity_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [req.user.id, limit]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;

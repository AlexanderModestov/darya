import { Router } from 'express';
import { query } from '../services/db.js';

const router = Router();

// GET /api/settings — Get current user's settings
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM settings WHERE user_id = $1', [req.user.id]);

    if (rows.length === 0) {
      return res.json({ cfg: {}, product: {} });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings — Save (upsert) current user's settings
router.put('/', async (req, res, next) => {
  try {
    const { cfg, product } = req.body;

    const { rows } = await query(
      `INSERT INTO settings (user_id, cfg, product)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET cfg = EXCLUDED.cfg,
             product = EXCLUDED.product
       RETURNING *`,
      [req.user.id, JSON.stringify(cfg || {}), JSON.stringify(product || {})]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;

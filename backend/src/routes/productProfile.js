import { Router } from 'express';
import { query } from '../services/db.js';

const router = Router();

// GET /api/product-profile — current user's saved product profile
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT data FROM product_profile WHERE user_id = $1', [req.user.id]);
    res.json(rows[0]?.data || {});
  } catch (err) {
    next(err);
  }
});

// PUT /api/product-profile — upsert current user's product profile
router.put('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `INSERT INTO product_profile (user_id, data)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET data = $2, updated_at = NOW()
       RETURNING data`,
      [req.user.id, JSON.stringify(req.body)]
    );
    res.json(rows[0].data);
  } catch (err) {
    next(err);
  }
});

export default router;

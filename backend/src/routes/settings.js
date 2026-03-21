import { Router } from 'express';
import { query } from '../services/db.js';
import { getEnvDefaults } from '../services/apiKeys.js';

const router = Router();

// GET /api/settings/defaults — Which API keys have env defaults (no values exposed)
router.get('/defaults', async (req, res) => {
  res.json(getEnvDefaults());
});

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
// Merges incoming cfg/product with existing data — partial updates are safe
router.put('/', async (req, res, next) => {
  try {
    const { cfg, product } = req.body;

    // Read existing settings
    const { rows: existing } = await query('SELECT cfg, product FROM settings WHERE user_id = $1', [req.user.id]);
    const current = existing[0] || { cfg: {}, product: {} };

    // Merge: new values override existing keys, but don't wipe unrelated field
    const mergedCfg = cfg !== undefined ? { ...current.cfg, ...cfg } : current.cfg;
    const mergedProduct = product !== undefined ? { ...current.product, ...product } : current.product;

    const { rows } = await query(
      `INSERT INTO settings (user_id, cfg, product)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET cfg = $2, product = $3
       RETURNING *`,
      [req.user.id, JSON.stringify(mergedCfg), JSON.stringify(mergedProduct)]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;

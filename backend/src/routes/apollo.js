import { Router } from 'express';
import { query } from '../services/db.js';

const router = Router();

/**
 * Helper: get Apollo API key from user's settings
 */
async function getApolloKey(userId) {
  const { rows } = await query('SELECT cfg FROM settings WHERE user_id = $1', [userId]);
  return rows[0]?.cfg?.apolloKey || null;
}

// ─── Apollo People Search (proxy) ───────────────────────────────────────────

router.post('/search', async (req, res) => {
  const apolloKey = await getApolloKey(req.user.id);
  if (!apolloKey) {
    return res.status(400).json({ error: 'Apollo API key not configured' });
  }

  try {
    const r = await fetch('https://api.apollo.io/v1/people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apolloKey,
      },
      body: JSON.stringify(req.body),
    });

    if (!r.ok) {
      return res.status(r.status).json({ error: `Apollo HTTP ${r.status}` });
    }

    const data = await r.json();
    return res.json(data);
  } catch (e) {
    console.error('Apollo search error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

export default router;

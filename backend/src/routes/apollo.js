import { Router } from 'express';
import { getApiKey } from '../services/apiKeys.js';

const router = Router();

/**
 * Helper: get Apollo API key (user setting → env fallback)
 */
async function getApolloKey(userId) {
  return getApiKey(userId, 'apolloKey');
}

// ─── Apollo People Search (proxy) ───────────────────────────────────────────

router.post('/search', async (req, res) => {
  const apolloKey = await getApolloKey(req.user.id);
  if (!apolloKey) {
    return res.status(400).json({ error: 'Apollo API key not configured' });
  }

  try {
    const r = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apolloKey,
      },
      body: JSON.stringify(req.body),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('Apollo people search error:', r.status, JSON.stringify(data));
      return res.status(r.status).json({ error: `Apollo HTTP ${r.status}`, details: data });
    }

    return res.json(data);
  } catch (e) {
    console.error('Apollo search error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ─── Apollo Organization Search (proxy) ──────────────────────────────────────

router.post('/organizations', async (req, res) => {
  const apolloKey = await getApolloKey(req.user.id);
  if (!apolloKey) {
    return res.status(400).json({ error: 'Apollo API key not configured' });
  }

  try {
    const r = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apolloKey,
      },
      body: JSON.stringify(req.body),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('Apollo org search error:', r.status, JSON.stringify(data));
      return res.status(r.status).json({ error: `Apollo HTTP ${r.status}`, details: data });
    }

    return res.json(data);
  } catch (e) {
    console.error('Apollo org search error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

export default router;

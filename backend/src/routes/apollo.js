import { Router } from 'express';
import { getApiKey } from '../services/apiKeys.js';

const router = Router();

async function getApolloKey(userId) {
  return getApiKey(userId, 'apolloKey');
}

async function getHunterKey(userId) {
  return getApiKey(userId, 'hunterKey');
}

/**
 * Call Hunter.io Domain Search and map results to Apollo-like format.
 */
async function hunterSearch(hunterKey, body) {
  const domain = body.q_organization_domains?.[0];
  const company = body.q_keywords;
  if (!domain && !company) return { people: [] };

  const params = new URLSearchParams({ api_key: hunterKey, limit: String(body.per_page || 5) });
  if (domain) params.set('domain', domain);
  else params.set('company', company);

  // Map person_titles to seniority/department filters when possible
  const titles = body.person_titles || [];
  const seniorTitles = ['CEO','CTO','CIO','Geschäftsführer','Managing Director','Head of IT'];
  if (titles.some(t => seniorTitles.includes(t))) {
    params.set('seniority', 'senior,executive');
  }

  const r = await fetch(`https://api.hunter.io/v2/domain-search?${params}`);
  const data = await r.json();
  if (!r.ok) {
    console.error('Hunter domain-search error:', r.status, JSON.stringify(data));
    throw new Error(`Hunter HTTP ${r.status}: ${data.errors?.[0]?.details || JSON.stringify(data)}`);
  }

  const emails = data.data?.emails || [];
  return {
    people: emails.map(e => ({
      first_name: e.first_name || '',
      last_name: e.last_name || '',
      title: e.position || '',
      email: e.value || '',
      linkedin_url: e.linkedin || '',
      phone_numbers: e.phone_number ? [{ sanitized_number: e.phone_number }] : [],
      organization: { name: data.data?.organization || company || '', phone: '' },
      _source: 'hunter'
    })),
    _provider: 'hunter'
  };
}

// ─── People Search (Apollo → Hunter.io fallback) ─────────────────────────────

router.post('/search', async (req, res) => {
  const apolloKey = await getApolloKey(req.user.id);

  // Try Apollo first
  if (apolloKey) {
    try {
      const r = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apolloKey },
        body: JSON.stringify(req.body),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) return res.json(data);

      // If not 403, return Apollo error directly
      if (r.status !== 403) {
        console.error('Apollo people search error:', r.status, JSON.stringify(data));
        return res.status(r.status).json({ error: `Apollo HTTP ${r.status}`, details: data });
      }
      // 403 → fall through to Hunter
      console.log('Apollo 403, falling back to Hunter.io');
    } catch (e) {
      console.error('Apollo search error:', e.message, '→ trying Hunter.io');
    }
  }

  // Fallback: Hunter.io
  const hunterKey = await getHunterKey(req.user.id);
  if (!hunterKey) {
    return res.status(400).json({
      error: 'Apollo API returned 403 (free plan) and no Hunter.io key configured. Add a Hunter.io API key in settings.'
    });
  }

  try {
    const data = await hunterSearch(hunterKey, req.body);
    return res.json(data);
  } catch (e) {
    console.error('Hunter search error:', e.message);
    return res.status(502).json({ error: e.message });
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
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apolloKey },
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

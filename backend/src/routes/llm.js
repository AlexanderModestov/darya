import { Router } from 'express';
import { query } from '../services/db.js';

const router = Router();

// POST /api/llm — Proxy LLM requests (Claude, OpenAI, Gemini)
router.post('/', async (req, res, next) => {
  try {
    // Get user's settings to retrieve API keys
    const { rows } = await query('SELECT cfg FROM settings WHERE user_id = $1', [req.user.id]);
    const cfg = rows[0]?.cfg || {};

    const { provider, model, prompt, max_tokens } = req.body;
    const prov = provider || cfg.provider || 'claude';
    const maxTok = max_tokens || 1200;

    if (prov === 'claude') {
      const key = cfg.claudeKey;
      if (!key) return res.status(400).json({ error: 'Kein Claude API-Key eingetragen' });

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-20250514',
          max_tokens: maxTok,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!r.ok) {
        const body = await r.text();
        return res.status(r.status).json({ error: `Claude HTTP ${r.status}`, details: body });
      }

      const d = await r.json();
      const text = (d.content || []).map(c => c.text || '').join('');
      return res.json({ text });
    }

    if (prov === 'openai') {
      const key = cfg.openaiKey;
      if (!key) return res.status(400).json({ error: 'Kein OpenAI API-Key eingetragen' });

      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: model || 'gpt-4o',
          max_tokens: maxTok,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!r.ok) {
        const body = await r.text();
        return res.status(r.status).json({ error: `OpenAI HTTP ${r.status}`, details: body });
      }

      const d = await r.json();
      const text = d.choices?.[0]?.message?.content || '';
      return res.json({ text });
    }

    if (prov === 'gemini') {
      const key = cfg.geminiKey;
      if (!key) return res.status(400).json({ error: 'Kein Gemini API-Key eingetragen' });

      const gemModel = model || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${gemModel}:generateContent?key=${key}`;

      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTok }
        })
      });

      if (!r.ok) {
        const body = await r.text();
        return res.status(r.status).json({ error: `Gemini HTTP ${r.status}`, details: body });
      }

      const d = await r.json();
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return res.json({ text });
    }

    return res.status(400).json({ error: `Unbekannter Anbieter: ${prov}` });
  } catch (err) {
    next(err);
  }
});

// POST /api/llm/test — Test API key connectivity
router.post('/test', async (req, res) => {
  const { provider, key } = req.body;

  try {
    if (provider === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });
      return res.json({ ok: r.ok, status: r.status });
    }

    if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      return res.json({ ok: r.ok, status: r.status });
    }

    if (provider === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      return res.json({ ok: r.ok, status: r.status });
    }

    return res.status(400).json({ error: 'Unknown provider' });
  } catch (e) {
    console.error('LLM test error:', e.message);
    return res.json({ ok: false, error: e.message });
  }
});

export default router;

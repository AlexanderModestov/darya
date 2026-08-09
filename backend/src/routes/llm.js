import { Router } from 'express';
import { getApiKey } from '../services/apiKeys.js';

const router = Router();

// POST /api/llm — Proxy LLM requests to the configured provider
router.post('/', async (req, res, next) => {
  try {
    const provider = process.env.LLM_PROVIDER || 'claude';
    const model = process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
    const { prompt, max_tokens } = req.body;
    const maxTok = max_tokens || 1200;

    if (provider === 'claude') {
      const key = getApiKey('claudeKey');
      if (!key) return res.status(400).json({ error: 'Kein Claude API-Key eingetragen' });

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
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

    if (provider === 'openai') {
      const key = getApiKey('openaiKey');
      if (!key) return res.status(400).json({ error: 'Kein OpenAI API-Key eingetragen' });

      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
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

    if (provider === 'gemini') {
      const key = getApiKey('geminiKey');
      if (!key) return res.status(400).json({ error: 'Kein Gemini API-Key eingetragen' });

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

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

    return res.status(400).json({ error: `Unbekannter Anbieter: ${provider}` });
  } catch (err) {
    next(err);
  }
});

export default router;

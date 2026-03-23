import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './swagger.js';

import authRoutes from './routes/auth.js';
import leadsRoutes from './routes/leads.js';
import emailsRoutes from './routes/emails.js';
import inboxRoutes from './routes/inbox.js';
import usersRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import logsRoutes from './routes/logs.js';
import llmRoutes from './routes/llm.js';
import apolloRoutes from './routes/apollo.js';
import { authMiddleware } from './middleware/auth.js';
import { apiLimiter, authLimiter } from './middleware/rateLimit.js';
import { getApiKey, getEnvDefaults } from './services/apiKeys.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('change-me')) {
  console.error('FATAL: Set a secure JWT_SECRET in .env');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

const origins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: origins.length > 0 ? origins : true,
  credentials: true
}));

app.use(express.json({ limit: '5mb' }));

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0' });
});

app.use('/api/auth', authRoutes);

app.use('/api/leads', authMiddleware, leadsRoutes);
app.use('/api/emails', authMiddleware, emailsRoutes);
app.use('/api/inbox', authMiddleware, inboxRoutes);
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);
app.use('/api/logs', authMiddleware, logsRoutes);
// Apollo proxy — search requires auth, test is public
app.post('/api/apollo/test', async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ ok: false, error: 'No key provided' });
  try {
    const r = await fetch('https://api.apollo.io/v1/auth/health', {
      method: 'GET', headers: { 'X-Api-Key': key }
    });
    return res.json({ ok: r.ok, status: r.status });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});
app.use('/api/apollo', authMiddleware, apolloRoutes);

// Serper.dev Google Search proxy — requires auth, key from user settings or env
app.post('/api/perplexity/search', authMiddleware, async (req, res) => {
  const pplxKey = await getApiKey(req.user.id, 'perplexityKey');
  if (!pplxKey) return res.status(400).json({ error: 'Perplexity API key not configured' });
  try {
    const { prompt, count } = req.body;
    const r = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + pplxKey },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: 'Du bist ein B2B-Lead-Recherche-Agent für den deutschen Markt. Antworte AUSSCHLIESSLICH mit einem JSON-Array, kein anderer Text.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 4000,
        temperature: 0.1
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: `Perplexity HTTP ${r.status}`, details: data });
    return res.json(data);
  } catch (e) {
    console.error('Perplexity search error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});
app.post('/api/perplexity/test', async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ ok: false, error: 'No key provided' });
  try {
    const r = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 10
      }),
    });
    return res.json({ ok: r.ok, status: r.status });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});

// LLM test endpoint — no auth needed (just validates external API keys)
app.post('/api/llm/test', async (req, res) => {
  const { provider, key } = req.body;
  try {
    let r;
    if (provider === 'claude') {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }] })
      });
    } else if (provider === 'openai') {
      r = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': `Bearer ${key}` } });
    } else if (provider === 'gemini') {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    } else {
      return res.status(400).json({ error: 'Unknown provider' });
    }
    return res.json({ ok: r.ok, status: r.status });
  } catch (e) {
    console.error('LLM test error:', e.message);
    return res.json({ ok: false, error: e.message });
  }
});
app.use('/api/llm', authMiddleware, llmRoutes);

app.use((err, _req, res, _next) => {
  console.error(err.stack || err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LeadOS API running on port ${PORT}`));

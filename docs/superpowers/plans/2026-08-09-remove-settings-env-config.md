# Remove Settings Page — Move Config to .env Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove LeadOS's Settings page and its DB-backed per-user config, moving all API keys and persona/sender/webhook config to backend `.env` (single shared config), while preserving the unrelated Email Gen "Product Prompt" feature under a renamed, dedicated endpoint.

**Architecture:** Backend `apiKeys.js` becomes a pure `process.env` reader (no DB, no `userId`). A new `GET /api/config` endpoint serves non-secret persona values and two boolean flags (`hasApolloKey`, `hasPerplexityKey`) to the frontend. A new `product_profile` table + `/api/product-profile` route replaces the `product` column of the old `settings` table. The `settings` table and route are dropped entirely. The frontend's Config page, its nav entry, and every function/state field that only existed to edit these DB-backed settings are deleted; the two features it also happened to host (JSON data export/import, a legacy user-list panel) are removed as agreed (the JSON export/import buttons already exist independently on the Leads page).

**Tech Stack:** Node.js/Express, PostgreSQL (`pg`), vanilla JS single-file frontend, no test framework — verification is manual (`node --check` for syntax, local docker-compose Postgres + curl for behavior).

## Global Constraints

- No automated test suite exists in this repo — every task's "verify" step is a manual command (syntax check, curl, or a browser walkthrough), per the approved spec's Testing & Verification section.
- Migrations in `backend/src/migrate.js` re-run **every** `.sql` file on **every** deploy (no migrations-tracking table) — every migration must be idempotent and safe to execute more than once.
- Per the approved spec, unused i18n dictionary entries (e.g. `ai_provider`, `backend_url`, `webhook_crm`, `msg_webhook_ok`, …) are intentionally left in place — pruning ~40 scattered key/value pairs across two large language blocks in `frontend/index.html` isn't worth the edit risk, and dead dictionary entries are harmless.
- `SERPER_API_KEY` in `.env.example` and the stale "Serper.dev" comment in `app.js` are pre-existing dead references from an old feature — out of scope, do not touch.
- Follow existing code style exactly (no semicolon-per-statement enforcement changes, no reformatting of untouched lines, German-language user-facing strings stay German).

---

### Task 1: Backend — add new env vars, simplify `apiKeys.js`, update deploy docs

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/src/services/apiKeys.js`
- Modify: `docs/deploy.md`

**Interfaces:**
- Produces: `getApiKey(cfgKey: string): string | null` — the ONLY export of `apiKeys.js` going forward. `cfgKey` is one of `'claudeKey' | 'openaiKey' | 'geminiKey' | 'apolloKey' | 'perplexityKey' | 'hunterKey' | 'resendKey'`. Tasks 2 and 3 consume this new one-argument signature.

- [ ] **Step 1: Update `backend/.env.example`**

Replace the full file content with:

```
# Database
DATABASE_URL=postgresql://leados:leados@localhost:5432/leados

# Auth
JWT_SECRET=change-me-to-a-random-64-char-string-use-openssl-rand-hex-32
JWT_EXPIRES_IN=7d

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=sales@yourdomain.com

# LLM — single fixed provider
LLM_PROVIDER=claude
LLM_MODEL=claude-sonnet-4-20250514
CLAUDE_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=

# Lead search
APOLLO_API_KEY=
HUNTER_API_KEY=
PERPLEXITY_API_KEY=
SERPER_API_KEY=

# Persona (used to build email-generation prompts)
SENDER_NAME=Daria
SENDER_ROLE=Lead AI Architect
SENDER_COMPANY=
EMAIL_SIGNATURE=Beste Grüße

# Sender identity (used to match inbox replies) + CRM webhook
SENDER_EMAIL=
SENDER_DISPLAY_NAME=
CRM_WEBHOOK_URL=

# Server
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:5500
```

- [ ] **Step 2: Rewrite `backend/src/services/apiKeys.js`**

Replace the full file content with:

```js
const ENV_MAP = {
  claudeKey: 'CLAUDE_API_KEY',
  openaiKey: 'OPENAI_API_KEY',
  geminiKey: 'GEMINI_API_KEY',
  apolloKey: 'APOLLO_API_KEY',
  perplexityKey: 'PERPLEXITY_API_KEY',
  hunterKey: 'HUNTER_API_KEY',
  resendKey: 'RESEND_API_KEY',
};

/**
 * Get a single API key from the environment. Single shared key for all users.
 */
export function getApiKey(cfgKey) {
  const envName = ENV_MAP[cfgKey];
  return envName ? process.env[envName] || null : null;
}
```

- [ ] **Step 3: Verify syntax**

Run: `node --check backend/src/services/apiKeys.js`
Expected: no output (exit code 0).

- [ ] **Step 4: Update `docs/deploy.md` Railway variables table**

Find the Railway `Variables` table (the `| Variable | Value |` block under section `2. Backend — Railway`) and add these rows after the existing `CORS_ORIGINS` row:

```
   | `LLM_PROVIDER` | `claude` |
   | `LLM_MODEL` | `claude-sonnet-4-20250514` |
   | `CLAUDE_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | key matching `LLM_PROVIDER` |
   | `APOLLO_API_KEY` / `HUNTER_API_KEY` / `PERPLEXITY_API_KEY` | lead-search keys |
   | `SENDER_NAME` / `SENDER_ROLE` / `SENDER_COMPANY` / `EMAIL_SIGNATURE` | persona used in generated emails |
   | `SENDER_EMAIL` / `SENDER_DISPLAY_NAME` | matches inbox replies to your sent mail |
   | `CRM_WEBHOOK_URL` | optional — fired server-side when a lead is created |
```

- [ ] **Step 5: Commit**

```bash
git add backend/.env.example backend/src/services/apiKeys.js docs/deploy.md
git commit -m "Move API keys to single shared .env config, drop per-user DB lookup"
```

---

### Task 2: Backend — update Apollo/Hunter/Perplexity/Resend routes to the new `getApiKey` signature

**Files:**
- Modify: `backend/src/routes/apollo.js`
- Modify: `backend/src/routes/emails.js`
- Modify: `backend/src/routes/inbox.js`
- Modify: `backend/src/app.js`

**Interfaces:**
- Consumes: `getApiKey(cfgKey)` from Task 1.

- [ ] **Step 1: Simplify `backend/src/routes/apollo.js`**

Replace:

```js
import { Router } from 'express';
import { getApiKey } from '../services/apiKeys.js';

const router = Router();

async function getApolloKey(userId) {
  return getApiKey(userId, 'apolloKey');
}

async function getHunterKey(userId) {
  return getApiKey(userId, 'hunterKey');
}
```

with:

```js
import { Router } from 'express';
import { getApiKey } from '../services/apiKeys.js';

const router = Router();
```

Then replace each of the three call sites:

`const apolloKey = await getApolloKey(req.user.id);` (appears twice, in `/search` and `/organizations`) → `const apolloKey = getApiKey('apolloKey');`

`const hunterKey = await getHunterKey(req.user.id);` → `const hunterKey = getApiKey('hunterKey');`

- [ ] **Step 2: Simplify `backend/src/routes/emails.js`**

Replace both occurrences of:

```js
    const resendKey = await getApiKey(userId, 'resendKey');
```

with:

```js
    const resendKey = getApiKey('resendKey');
```

(One is inside `POST /approve-all`, the other inside `POST /:id/approve` — both use the local variable name `userId` already in scope, no other changes needed on those lines.)

- [ ] **Step 3: Simplify `backend/src/routes/inbox.js`**

Replace:

```js
    const resendKey = await getApiKey(req.user.id, 'resendKey');
```

with:

```js
    const resendKey = getApiKey('resendKey');
```

- [ ] **Step 4: Update `backend/src/app.js` — perplexity/search route, remove test-only routes**

Replace:

```js
import { getApiKey, getEnvDefaults } from './services/apiKeys.js';
```

with:

```js
import { getApiKey } from './services/apiKeys.js';
```

Replace:

```js
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
// Hunter.io test — no auth needed (validates external key)
app.post('/api/hunter/test', async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ ok: false, error: 'No key provided' });
  try {
    const r = await fetch(`https://api.hunter.io/v2/account?api_key=${key}`);
    return res.json({ ok: r.ok, status: r.status });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});

// Serper.dev Google Search proxy — requires auth, key from user settings or env
app.post('/api/perplexity/search', authMiddleware, async (req, res) => {
  const pplxKey = await getApiKey(req.user.id, 'perplexityKey');
```

with:

```js
app.use('/api/logs', authMiddleware, logsRoutes);
app.use('/api/apollo', authMiddleware, apolloRoutes);

// Serper.dev Google Search proxy — requires auth, key from user settings or env
app.post('/api/perplexity/search', authMiddleware, async (req, res) => {
  const pplxKey = getApiKey('perplexityKey');
```

(This drops the `settings` import/mount reference and the `/api/apollo/test` + `/api/hunter/test` inline routes — the settings import removal itself happens in Task 6 alongside deleting the file; leaving the reference dangling for one task is fine since Task 6 removes `import settingsRoutes` next, and the plan executes in order.)

Replace:

```js
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
```

with:

```js
app.use('/api/llm', authMiddleware, llmRoutes);
```

- [ ] **Step 5: Verify syntax on all four files**

Run: `node --check backend/src/routes/apollo.js && node --check backend/src/routes/emails.js && node --check backend/src/routes/inbox.js && node --check backend/src/app.js`
Expected: no output (exit code 0). Note `app.js` will still reference `settingsRoutes` (imported, unused-mount removed) until Task 6 — that's expected and does not break syntax checking.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/apollo.js backend/src/routes/emails.js backend/src/routes/inbox.js backend/src/app.js
git commit -m "Drop per-user key lookups and test-connection endpoints for Apollo/Hunter/Perplexity/Resend"
```

---

### Task 3: Backend — collapse `llm.js` to one fixed provider/model

**Files:**
- Modify: `backend/src/routes/llm.js`

**Interfaces:**
- Consumes: `getApiKey(cfgKey)` from Task 1.
- Produces: `POST /api/llm` now reads `LLM_PROVIDER`/`LLM_MODEL` from env; request body only needs `{ prompt, max_tokens }` (frontend update happens in Task 9).

- [ ] **Step 1: Replace the full content of `backend/src/routes/llm.js`**

```js
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
```

- [ ] **Step 2: Verify syntax**

Run: `node --check backend/src/routes/llm.js`
Expected: no output (exit code 0).

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/llm.js
git commit -m "Collapse LLM provider selection to LLM_PROVIDER/LLM_MODEL env vars"
```

---

### Task 4: Backend — new `GET /api/config` endpoint

**Files:**
- Create: `backend/src/routes/config.js`
- Modify: `backend/src/app.js`
- Modify: `backend/src/swagger.js`

**Interfaces:**
- Consumes: `getApiKey(cfgKey)` from Task 1.
- Produces: `GET /api/config` → `{ senderName, senderRole, senderCompany, signature, senderEmail, senderDisplayName, hasApolloKey, hasPerplexityKey }`. Task 9 (frontend) consumes this exact shape.

- [ ] **Step 1: Create `backend/src/routes/config.js`**

```js
import { Router } from 'express';
import { getApiKey } from '../services/apiKeys.js';

const router = Router();

// GET /api/config — non-secret runtime config for the frontend
router.get('/', (_req, res) => {
  res.json({
    senderName: process.env.SENDER_NAME || '',
    senderRole: process.env.SENDER_ROLE || '',
    senderCompany: process.env.SENDER_COMPANY || '',
    signature: process.env.EMAIL_SIGNATURE || '',
    senderEmail: process.env.SENDER_EMAIL || '',
    senderDisplayName: process.env.SENDER_DISPLAY_NAME || '',
    hasApolloKey: !!getApiKey('apolloKey'),
    hasPerplexityKey: !!getApiKey('perplexityKey'),
  });
});

export default router;
```

- [ ] **Step 2: Mount it in `backend/src/app.js`**

Replace:

```js
import usersRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import logsRoutes from './routes/logs.js';
```

with:

```js
import usersRoutes from './routes/users.js';
import configRoutes from './routes/config.js';
import logsRoutes from './routes/logs.js';
```

Replace:

```js
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/logs', authMiddleware, logsRoutes);
```

with:

```js
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/config', authMiddleware, configRoutes);
app.use('/api/logs', authMiddleware, logsRoutes);
```

- [ ] **Step 3: Add Swagger docs for `/api/config`**

In `backend/src/swagger.js`, replace:

```js
    { name: 'Users', description: 'User management (admin only)' },
    { name: 'Settings', description: 'User configuration & company profile' },
    { name: 'Logs', description: 'Activity log' },
```

with:

```js
    { name: 'Users', description: 'User management (admin only)' },
    { name: 'Config', description: 'Server-side persona and integration config' },
    { name: 'Logs', description: 'Activity log' },
```

Then replace the `Settings` schema block:

```js
      Settings: {
        type: 'object',
        properties: {
          cfg:     { type: 'object', description: 'UI configuration JSON' },
          product: { type: 'object', description: 'Company profile JSON' },
        },
      },
```

with:

```js
      Config: {
        type: 'object',
        properties: {
          senderName:        { type: 'string' },
          senderRole:        { type: 'string' },
          senderCompany:     { type: 'string' },
          signature:         { type: 'string' },
          senderEmail:       { type: 'string' },
          senderDisplayName: { type: 'string' },
          hasApolloKey:      { type: 'boolean' },
          hasPerplexityKey:  { type: 'boolean' },
        },
      },
```

Then replace the `// ── Settings ────` path block:

```js
    // ── Settings ────────────────────────────────────
    '/api/settings': {
      get: {
        tags: ['Settings'],
        summary: 'Get user settings',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Settings', content: { 'application/json': { schema: { $ref: '#/components/schemas/Settings' } } } },
        },
      },
      put: {
        tags: ['Settings'],
        summary: 'Update user settings',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Settings' } } } },
        responses: {
          200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Settings' } } } },
        },
      },
    },
```

with:

```js
    // ── Config ──────────────────────────────────────
    '/api/config': {
      get: {
        tags: ['Config'],
        summary: 'Get server-side persona and integration config',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Config', content: { 'application/json': { schema: { $ref: '#/components/schemas/Config' } } } },
        },
      },
    },
```

- [ ] **Step 4: Verify syntax**

Run: `node --check backend/src/routes/config.js && node --check backend/src/app.js && node --check backend/src/swagger.js`
Expected: no output (exit code 0).

- [ ] **Step 5: Manual verification against a running server**

```bash
docker compose up -d db
cd backend
cp .env.example .env
# edit .env: set JWT_SECRET to any long random string, SENDER_NAME=TestSender
npm install
npm run migrate
npm run dev &
sleep 1
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"test@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s http://localhost:3000/api/config -H "Authorization: Bearer $TOKEN"
```

Expected: JSON with `"senderName":"TestSender"` and `"hasApolloKey":false` (no key set yet).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/config.js backend/src/app.js backend/src/swagger.js
git commit -m "Add GET /api/config for non-secret persona/integration config"
```

---

### Task 5: Backend — `product_profile` table + `/api/product-profile`, drop `settings`

**Files:**
- Create: `backend/migrations/004_product_profile_and_drop_settings.sql`
- Create: `backend/src/routes/productProfile.js`
- Modify: `backend/src/app.js`
- Modify: `backend/src/swagger.js`
- Delete: `backend/src/routes/settings.js`

**Interfaces:**
- Produces: `GET /api/product-profile` → the saved profile object (or `{}`); `PUT /api/product-profile` with the profile object as body → upserts and returns it. Task 10 (frontend) consumes this.

- [ ] **Step 1: Create the migration `backend/migrations/004_product_profile_and_drop_settings.sql`**

```sql
-- Replace settings.product (per-user "Product Prompt" for email generation)
-- with a dedicated table, then drop the now-unused settings table
-- (API keys and persona config moved to .env — see backend/.env.example).

CREATE TABLE IF NOT EXISTS product_profile (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Carry over any existing product prompts before dropping settings.
-- Guarded so this migration is safe to re-run after settings no longer exists
-- (migrate.js re-applies every .sql file on every deploy).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings') THEN
    INSERT INTO product_profile (user_id, data)
    SELECT user_id, product FROM settings
    WHERE product IS NOT NULL AND product::text <> '{}'
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

DROP TABLE IF EXISTS settings;
```

- [ ] **Step 2: Create `backend/src/routes/productProfile.js`**

```js
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
```

- [ ] **Step 3: Delete `backend/src/routes/settings.js`**

```bash
git rm backend/src/routes/settings.js
```

- [ ] **Step 4: Update `backend/src/app.js`**

Replace:

```js
import configRoutes from './routes/config.js';
import logsRoutes from './routes/logs.js';
```

with:

```js
import configRoutes from './routes/config.js';
import productProfileRoutes from './routes/productProfile.js';
import logsRoutes from './routes/logs.js';
```

Replace:

```js
app.use('/api/config', authMiddleware, configRoutes);
app.use('/api/logs', authMiddleware, logsRoutes);
```

with:

```js
app.use('/api/config', authMiddleware, configRoutes);
app.use('/api/product-profile', authMiddleware, productProfileRoutes);
app.use('/api/logs', authMiddleware, logsRoutes);
```

- [ ] **Step 5: Add Swagger docs for `/api/product-profile`**

In `backend/src/swagger.js`, replace the `Config` schema block from Task 4 by adding a new schema right after it:

```js
      Config: {
        type: 'object',
        properties: {
          senderName:        { type: 'string' },
          senderRole:        { type: 'string' },
          senderCompany:     { type: 'string' },
          signature:         { type: 'string' },
          senderEmail:       { type: 'string' },
          senderDisplayName: { type: 'string' },
          hasApolloKey:      { type: 'boolean' },
          hasPerplexityKey:  { type: 'boolean' },
        },
      },
      ProductProfile: {
        type: 'object',
        description: 'Free-form sales-pitch content used to personalize generated emails',
        properties: {
          name:     { type: 'string' },
          target:   { type: 'string' },
          what:     { type: 'string' },
          problems: { type: 'string' },
          usp:      { type: 'string' },
          roi:      { type: 'string' },
          pricing:  { type: 'string' },
          refs:     { type: 'string' },
          prompt:   { type: 'string' },
          saved:    { type: 'string' },
        },
      },
```

Replace the `// ── Config ──` path block from Task 4 by adding a new path right after it:

```js
    // ── Config ──────────────────────────────────────
    '/api/config': {
      get: {
        tags: ['Config'],
        summary: 'Get server-side persona and integration config',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Config', content: { 'application/json': { schema: { $ref: '#/components/schemas/Config' } } } },
        },
      },
    },
    '/api/product-profile': {
      get: {
        tags: ['Config'],
        summary: "Get the current user's saved product profile",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Product profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductProfile' } } } },
        },
      },
      put: {
        tags: ['Config'],
        summary: "Upsert the current user's product profile",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductProfile' } } } },
        responses: {
          200: { description: 'Saved product profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductProfile' } } } },
        },
      },
    },
```

- [ ] **Step 6: Verify syntax**

Run: `node --check backend/src/routes/productProfile.js && node --check backend/src/app.js && node --check backend/src/swagger.js`
Expected: no output (exit code 0).

- [ ] **Step 7: Manual verification of the migration and route against local Postgres**

```bash
docker compose up -d db
psql postgresql://leados:leados@localhost:5432/leados -c "\d settings" # confirm it currently exists from prior tasks' testing, or skip if fresh DB
cd backend && npm run migrate
psql postgresql://leados:leados@localhost:5432/leados -c "\dt" # confirm product_profile exists, settings does not
npm run migrate # run a second time — must succeed with no errors (idempotency check)
npm run dev &
sleep 1
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -X PUT http://localhost:3000/api/product-profile -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Acme Widgets","what":"We sell widgets"}'
curl -s http://localhost:3000/api/product-profile -H "Authorization: Bearer $TOKEN"
```

Expected: both curl calls return `{"name":"Acme Widgets","what":"We sell widgets"}`; the second `npm run migrate` prints "Migration 004_product_profile_and_drop_settings.sql applied successfully" with no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/migrations/004_product_profile_and_drop_settings.sql backend/src/routes/productProfile.js backend/src/app.js backend/src/swagger.js
git commit -m "Replace settings table with product_profile; drop settings route and table"
```

---

### Task 6: Backend — move CRM webhook firing server-side

**Files:**
- Modify: `backend/src/routes/leads.js`

**Interfaces:**
- Produces: `POST /api/leads` now fires `CRM_WEBHOOK_URL` (if set) server-side after insert, matching the payload shape the frontend used to send (`{...lead, source:'LeadOS', ts: ISO string}`).

- [ ] **Step 1: Update the Create Lead route in `backend/src/routes/leads.js`**

Replace:

```js
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const lead = await insertLead(userId, req.body);
    await logActivity(userId, 'lead_created', 'lead', lead.id, { name: lead.name });
    res.status(201).json(lead);
  } catch (err) {
    console.error('Create lead error:', err);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});
```

with:

```js
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const lead = await insertLead(userId, req.body);
    await logActivity(userId, 'lead_created', 'lead', lead.id, { name: lead.name });
    if (process.env.CRM_WEBHOOK_URL) {
      fetch(process.env.CRM_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lead, source: 'LeadOS', ts: new Date().toISOString() }),
      }).catch((e) => console.error('CRM webhook error:', e.message));
    }
    res.status(201).json(lead);
  } catch (err) {
    console.error('Create lead error:', err);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});
```

- [ ] **Step 2: Verify syntax**

Run: `node --check backend/src/routes/leads.js`
Expected: no output (exit code 0).

- [ ] **Step 3: Manual verification with a local webhook receiver**

```bash
node -e "require('http').createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{console.log('WEBHOOK RECEIVED:',b);res.end('ok')})}).listen(4000)" &
# with the backend from Task 5 still running and CRM_WEBHOOK_URL=http://localhost:4000 set in backend/.env (restart npm run dev after editing):
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"test@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -X POST http://localhost:3000/api/leads -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Test Lead GmbH"}'
```

Expected: the `node -e` listener process prints `WEBHOOK RECEIVED: {"id":"...","name":"Test Lead GmbH",...,"source":"LeadOS","ts":"..."}`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/leads.js
git commit -m "Fire CRM webhook server-side on lead creation instead of client-side"
```

---

### Task 7: Frontend — remove the Settings page and its nav entry

**Files:**
- Modify: `frontend/index.html`

**Interfaces:**
- Produces: the `PAGES` array and `nav()` no longer know about a `'config'` page — Task 9 relies on this being done here (not later), since `nav()` is called from every other page's navigation and would otherwise throw on every click.

- [ ] **Step 1: Fix `PAGES` and `nav()` before removing the HTML — the nav-item-to-page mapping is index-based and breaks otherwise**

Replace:

```js
const PAGES = ['agent','linkedin','emailgen','approve','inbox','leads','log','config','team'];
const nav = id => {
  PAGES.forEach(p => { $('pg-'+p).classList.toggle('on', p===id); });
  document.querySelectorAll('.ni').forEach((el,i) => el.classList.toggle('on', PAGES[i]===id));
  if(id==='leads') renderLeads();
  if(id==='approve') { approveFilter='all'; renderApprove(); }
  if(id==='inbox') renderInbox();
  if(id==='log') renderLog();
  if(id==='emailgen') { renderCatGrid(); renderLeadPicker(); }
  if(id==='linkedin') { renderCompanyList(); }
  if(id==='team') renderTeam();
  if(id==='config') { renderUsersList(); }
};
```

with:

```js
const PAGES = ['agent','linkedin','emailgen','approve','inbox','leads','log','team'];
const nav = id => {
  PAGES.forEach(p => { $('pg-'+p).classList.toggle('on', p===id); });
  document.querySelectorAll('.ni').forEach((el,i) => el.classList.toggle('on', PAGES[i]===id));
  if(id==='leads') renderLeads();
  if(id==='approve') { approveFilter='all'; renderApprove(); }
  if(id==='inbox') renderInbox();
  if(id==='log') renderLog();
  if(id==='emailgen') { renderCatGrid(); renderLeadPicker(); }
  if(id==='linkedin') { renderCompanyList(); }
  if(id==='team') renderTeam();
};
```

`PAGES` must list exactly one entry per remaining `.ni` sidebar item, in the same order, because `nav()` maps them positionally by index — removing the "Konfiguration" `.ni` div (next step) without this change would misalign every nav item after it and throw on `$('pg-config').classList` (null).

- [ ] **Step 2: Remove the "Konfiguration" nav item**

Replace:

```html
  <div class="nav-sec" data-t="nav_system_sec">System</div>
  <div class="ni" onclick="nav('config')"><span>⊕</span> <span data-t="nav_config">Konfiguration</span></div>
  <div class="ni" id="nav-team" onclick="nav('team')" style="display:none"><span>👥</span> <span data-t="nav_team">Team & Benutzer</span></div>
```

with:

```html
  <div class="nav-sec" data-t="nav_system_sec">System</div>
  <div class="ni" id="nav-team" onclick="nav('team')" style="display:none"><span>👥</span> <span data-t="nav_team">Team & Benutzer</span></div>
```

- [ ] **Step 3: Remove the entire `pg-config` page block**

Replace the full block starting at `<!-- ═══ CONFIG ═══ -->` and ending at the `</div>` that closes `pg-config` (immediately before the `<!-- ═══ LINKEDIN PROSPECTING ═══ -->` comment):

```html
<!-- ═══ CONFIG ═══ -->
<div id="pg-config" class="pg">
  <div class="ph">
    <div><div class="ph-t" data-t="config_title">Konfiguration</div><div class="ph-s" data-t="config_subtitle">API-Keys, Apollo.io, Absender-Profil, Webhook</div></div>
    <button class="btn btn-g" onclick="saveConfig()" data-t="save">Speichern</button>
  </div>
  <div class="pn">
    <div class="pn-h"><span class="pn-ht" data-t="lang_title">Sprache / Language</span></div>
    <div class="pn-b">
      <div class="fg" style="margin-bottom:0">
        <select class="inp" id="c-lang" onchange="switchLang(this.value)">
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </div>
    </div>
  </div>
  <div id="cfg-alrt" style="display:none" class="alrt"></div>
  <div class="pn">
    <div class="pn-h"><span class="pn-ht" data-t="ai_provider">KI-Anbieter</span><span id="p-claude" class="pill pill-off">● OFFLINE</span></div>
    <div class="pn-b">
      <div class="fr" style="margin-bottom:14px">
        <div class="fg" style="margin-bottom:0">
          <label data-t="choose_provider">Anbieter wählen</label>
          <select class="inp" id="c-provider" onchange="switchProvider(this.value)">
            <option value="claude">Anthropic Claude</option>
            <option value="openai">OpenAI (ChatGPT)</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>
        <div class="fg" style="margin-bottom:0">
          <label data-t="model">Modell</label>
          <select class="inp" id="c-model" style="max-width:360px">
            <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (empfohlen)</option>
            <option value="claude-opus-4-20250514">Claude Opus 4</option>
            <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (schnell)</option>
          </select>
        </div>
      </div>
      <!-- Claude -->
      <div id="key-claude" class="fg">
        <label>Claude API Key</label>
        <div style="display:flex;gap:10px">
          <input class="inp" id="c-key" type="password" placeholder="sk-ant-api03-…">
          <button class="btn btn-sm" onclick="testClaude()" data-t="test">Testen</button>
        </div>
        <div style="font-size:10px;color:var(--t3);margin-top:4px">console.anthropic.com → API Keys</div>
      </div>
      <!-- OpenAI -->
      <div id="key-openai" class="fg" style="display:none">
        <label>OpenAI API Key</label>
        <div style="display:flex;gap:10px">
          <input class="inp" id="c-openai-key" type="password" placeholder="sk-proj-…">
          <button class="btn btn-sm" onclick="testOpenAI()" data-t="test">Testen</button>
        </div>
        <div style="font-size:10px;color:var(--t3);margin-top:4px">platform.openai.com → API Keys</div>
      </div>
      <!-- Gemini -->
      <div id="key-gemini" class="fg" style="display:none;margin-bottom:0">
        <label>Gemini API Key</label>
        <div style="display:flex;gap:10px">
          <input class="inp" id="c-gemini-key" type="password" placeholder="AIzaSy…">
          <button class="btn btn-sm" onclick="testGemini()" data-t="test">Testen</button>
        </div>
        <div style="font-size:10px;color:var(--t3);margin-top:4px">aistudio.google.com → Get API Key · Kostenlos</div>
      </div>
    </div>
  </div>
  <div class="pn">
    <div class="pn-h"><span class="pn-ht" data-t="apollo_title">Apollo.io (Kontaktsuche)</span><span id="p-apollo" class="pill pill-off">● OFFLINE</span></div>
    <div class="pn-b">
      <div class="fg" style="margin-bottom:0">
        <label>Apollo.io API Key</label>
        <div style="display:flex;gap:10px">
          <input class="inp" id="c-apollo" type="password" placeholder="apollo_api_key_...">
          <button class="btn btn-sm" onclick="testApollo()" data-t="test">Testen</button>
        </div>
        <div style="font-size:10px;color:var(--t3);margin-top:4px">apollo.io → Settings → API Keys · Free: 50 Anfragen/Tag</div>
      </div>
    </div>
  </div>
  <div class="pn">
    <div class="pn-h"><span class="pn-ht">Hunter.io (Fallback Kontaktsuche)</span><span id="p-hunter" class="pill pill-off">● OFFLINE</span></div>
    <div class="pn-b">
      <div class="fg" style="margin-bottom:0">
        <label>Hunter.io API Key</label>
        <div style="display:flex;gap:10px">
          <input class="inp" id="c-hunter" type="password" placeholder="hunter_api_key_...">
          <button class="btn btn-sm" onclick="testHunter()" data-t="test">Testen</button>
        </div>
        <div style="font-size:10px;color:var(--t3);margin-top:4px">hunter.io → API Keys · Free: 25 Suchen/Monat · Fallback wenn Apollo 403</div>
      </div>
    </div>
  </div>
  <div class="pn">
    <div class="pn-h"><span class="pn-ht">Perplexity (AI-Suche)</span><span id="p-perplexity" class="pill pill-off">● OFFLINE</span></div>
    <div class="pn-b">
      <div class="fg" style="margin-bottom:0">
        <label>Perplexity API Key</label>
        <div style="display:flex;gap:10px">
          <input class="inp" id="c-perplexity" type="password" placeholder="pplx-...">
          <button class="btn btn-sm" onclick="testPerplexity()" data-t="test">Testen</button>
        </div>
        <div style="font-size:10px;color:var(--t3);margin-top:4px">perplexity.ai → API Settings → API Keys</div>
      </div>
    </div>
  </div>
  <div class="pn">
    <div class="pn-h"><span class="pn-ht">Resend (E-Mail-Versand)</span><span id="p-resend" class="pill pill-off">● OFFLINE</span></div>
    <div class="pn-b">
      <div class="fg" style="margin-bottom:0">
        <label>Resend API Key</label>
        <div style="display:flex;gap:10px">
          <input class="inp" id="c-resend" type="password" placeholder="re_...">
        </div>
        <div style="font-size:10px;color:var(--t3);margin-top:4px">resend.com → API Keys · Wird für E-Mail-Versand verwendet (Freigabe &amp; Antworten)</div>
      </div>
    </div>
  </div>
  <div class="pn">
    <div class="pn-h"><span class="pn-ht">Backend</span><span id="p-backend" class="pill pill-off">● OFFLINE</span></div>
    <div class="pn-b">
      <div class="fg" style="margin-bottom:0">
        <label data-t="backend_url">Backend URL</label>
        <div style="display:flex;gap:10px">
          <input class="inp" id="c-backend" placeholder="http://localhost:3000 oder https://your-app.railway.app" data-tp="ph_backend">
          <button class="btn btn-sm" onclick="testBackend()" data-t="test">Testen</button>
        </div>
        <div style="font-size:10px;color:var(--t3);margin-top:5px" data-t="backend_hint">
          Leer lassen = lokaler Modus (Daten im Browser). Mit Backend-URL = Server-Modus (Daten in PostgreSQL).
        </div>
      </div>
    </div>
  </div>

  <div class="pn">
    <div class="pn-h"><span class="pn-ht" data-t="sender_profile">Absender-Profil</span></div>
    <div class="pn-b">
      <div class="fr">
        <div class="fg"><label>Name</label><input class="inp" id="c-name" placeholder="Daria"></div>
        <div class="fg"><label data-t="role">Rolle</label><input class="inp" id="c-role" placeholder="Lead AI Architect"></div>
      </div>
      <div class="fr" style="margin-bottom:0">
        <div class="fg" style="margin-bottom:0"><label data-t="company">Unternehmen</label><input class="inp" id="c-co" placeholder="Meine GmbH" data-tp="ph_company"></div>
        <div class="fg" style="margin-bottom:0"><label data-t="signature">Signatur</label><input class="inp" id="c-sig" placeholder="Beste Grüße, Daria" data-tp="ph_sig"></div>
      </div>
    </div>
  </div>
  <div class="pn">
    <div class="pn-h"><span class="pn-ht" data-t="gmail_email">Gmail / E-Mail</span><span id="p-gmail" class="pill pill-off">● OFFLINE</span></div>
    <div class="pn-b">
      <div class="fr" style="margin-bottom:0">
        <div class="fg" style="margin-bottom:0"><label data-t="sender_email">Absender-E-Mail</label><input class="inp" id="c-gfrom" placeholder="daria@firma.de" type="email"></div>
        <div class="fg" style="margin-bottom:0"><label data-t="display_name">Anzeigename</label><input class="inp" id="c-gname" placeholder="Daria, Lead AI Architect"></div>
      </div>
    </div>
  </div>
  <div class="pn">
    <div class="pn-h"><span class="pn-ht" data-t="webhook_crm">Webhook / CRM</span><span id="p-wh" class="pill pill-off">● OFFLINE</span></div>
    <div class="pn-b">
      <div class="fg" style="margin-bottom:0"><label>Webhook URL</label>
        <div style="display:flex;gap:10px">
          <input class="inp" id="c-wh" placeholder="https://hook.zapier.com/…">
          <button class="btn btn-sm" onclick="testWH()" data-t="test">Testen</button>
        </div>
      </div>
    </div>
  </div>
  <div class="pn">
    <div class="pn-h"><span class="pn-ht" data-t="data">Daten</span></div>
    <div class="pn-b" style="display:flex;gap:8px">
      <button class="btn btn-sm" onclick="expJSON()" data-t="json_export">JSON Export</button>
      <button class="btn btn-sm" onclick="impJSON()" data-t="json_import">JSON Import</button>
      <button class="btn btn-sm btn-r" onclick="nukeAll()" data-t="delete_data">Meine Daten löschen</button>
    </div>
  </div>
  <div class="pn">
    <div class="pn-h">
      <span class="pn-ht" data-t="user_mgmt">Nutzer-Verwaltung</span>
      <span id="p-admin" class="pill" style="display:none"></span>
    </div>
    <div class="pn-b">
      <div id="users-list" style="margin-bottom:10px"></div>
      <div style="font-size:10px;color:var(--t3)" data-t="user_mgmt_hint">Neue Nutzer registrieren sich selbst über den Login-Screen. Als Admin kannst du alle Accounts sehen und löschen.</div>
    </div>
  </div>
</div>

```

with an empty string (i.e. delete the block entirely, leaving the blank line before `<!-- ═══ LINKEDIN PROSPECTING ═══ -->` as the only separator).

- [ ] **Step 4: Manual verification**

Open `frontend/index.html` in a browser (adjust `AUTH_API`/`BACKEND_URL` temporarily to point at a running backend, or just check statically). Confirm: the sidebar has no "Konfiguration" entry, `grep -c 'pg-config' frontend/index.html` returns `0`, and clicking through every remaining nav item (Agent, LinkedIn, E-Mails generieren, Freigabe, Inbox, Lead-Datenbank, Aktivitätslog, and Team if logged in as admin) switches pages correctly with no JS console errors on navigation itself. (Buttons that used to live on the Settings page no longer exist, so there's nothing left to click that would reference the now-missing `saveConfig`/`switchProvider`/etc. — those are deleted in Task 9.)

- [ ] **Step 5: Commit**

```bash
git add frontend/index.html
git commit -m "Remove Settings page HTML and nav entry"
```

---

### Task 8: Frontend — slim `cfg`, hardcode backend URL, rewire `load()`/`save()`

**Files:**
- Modify: `frontend/index.html`

**Interfaces:**
- Consumes: `GET /api/config` (Task 4) and `GET /api/product-profile` (Task 5).
- Produces: `cfg` now only holds `{ name, role, co, sig, gFrom, gName, lang }` plus whatever `envDefaults` is repurposed to hold (`{ apolloKey: boolean, perplexityKey: boolean }`) — Task 9's gate call sites and Task 10's `applyCfg`/product-prompt functions consume these.

- [ ] **Step 1: Slim the `cfg` object literal and `envDefaults` comment**

Replace:

```js
let leads   = [];
let pending = [];
let inbox   = [];
let logs    = [];
let cfg = { provider:'claude', claudeKey:'', openaiKey:'', geminiKey:'', model:'claude-sonnet-4-20250514', name:'Daria', role:'Lead AI Architect', co:'', sig:'Beste Grüße', gFrom:'', gName:'', whUrl:'', apolloKey:'', hunterKey:'', perplexityKey:'', resendKey:'', backendUrl:'https://darya-production.up.railway.app', lang:'de' };
```

with:

```js
let leads   = [];
let pending = [];
let inbox   = [];
let logs    = [];
let cfg = { name:'Daria', role:'Lead AI Architect', co:'', sig:'Beste Grüße', gFrom:'', gName:'', lang:'de' };
```

Then find the `envDefaults` declaration a few lines below and replace:

```js
let envDefaults = {}; // which API keys have server-side env defaults
```

with:

```js
let envDefaults = {}; // { apolloKey: boolean, perplexityKey: boolean } — from GET /api/config
```

- [ ] **Step 2: Hardcode the backend URL**

Replace:

```js
const AUTH_MODE = 'backend';
const AUTH_API  = () => (cfg.backendUrl || window.location.origin).replace(/\/$/, '');
```

with:

```js
const AUTH_MODE = 'backend';
const BACKEND_URL = 'https://darya-production.up.railway.app';
const AUTH_API  = () => BACKEND_URL;
```

- [ ] **Step 3: Rewire `save()`/`load()` to `/api/config` and `/api/product-profile`**

Replace:

```js
const save = () => {
  // Always persist cfg to localStorage (needed to bootstrap backend URL)
  localStorage.setItem('los3_cfg', JSON.stringify(cfg));
  if (AUTH_MODE === 'backend' && AUTH_API()) return;
  ['leads','pending','inbox','logs'].forEach(k => localStorage.setItem(userKey(k), JSON.stringify(eval(k))));
};
const load = async () => {
  // Restore local-only settings from localStorage before server overwrite
  try { const c = localStorage.getItem('los3_cfg'); if(c) { const lc = JSON.parse(c); cfg = { ...cfg, ...lc }; } } catch(e){}

  if (AUTH_MODE === 'backend' && AUTH_API()) {
    try {
      const localOnly = { backendUrl: cfg.backendUrl };
      const [leadsRes, emailsRes, inboxRes, settingsRes, logsRes, defaultsRes] = await Promise.all([
        authFetch('/api/leads'),
        authFetch('/api/emails'),
        authFetch('/api/inbox'),
        authFetch('/api/settings'),
        authFetch('/api/logs?limit=200'),
        authFetch('/api/settings/defaults')
      ]);
      if (leadsRes.ok) leads = (await leadsRes.json()).map(l => ({
        ...l,
        kontaktEmail: l.kontaktEmail || l.kontakt_email,
        firmenEmail: l.firmenEmail || l.firmen_email,
        email: l.email || l.kontakt_email || l.firmen_email,
        created: l.created || l.created_at
      }));
      if (emailsRes.ok) pending = (await emailsRes.json()).map(e => ({
        ...e,
        leadId: e.leadId || e.lead_id,
        leadName: e.leadName || e.lead_name,
        leadEmail: e.leadEmail || e.lead_email,
        contactName: e.contactName || e.contact_name,
        contactRole: e.contactRole || e.contact_role,
        contactPhone: e.contactPhone || e.contact_phone,
        catId: e.catId || e.cat_id,
        catName: e.catName || e.cat_name,
        resendId: e.resendId || e.resend_id,
        created: e.created || e.created_at
      }));
      if (inboxRes.ok) inbox = (await inboxRes.json()).map(i => ({
        ...i,
        leadId: i.leadId || i.lead_id,
        from: i.from || i.from_name,
        fromEmail: i.fromEmail || i.from_email,
        catName: i.catName || i.cat_name,
        origBody: i.origBody || i.orig_body,
        replyBody: i.replyBody || i.reply_body,
        time: i.time || i.received_at
      }));
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        if (s.cfg) cfg = { ...cfg, ...s.cfg, ...localOnly };
        if (s.product) try { localStorage.setItem('los3_product', JSON.stringify(s.product)); } catch(e){}
      }
      if (logsRes.ok) {
        const serverLogs = await logsRes.json();
        logs = serverLogs.map(l => ({ msg: l.action + (l.details?.name ? ': ' + l.details.name : ''), t: 'info', time: l.created_at }));
      }
      if (defaultsRes.ok) {
        envDefaults = await defaultsRes.json();
      }
    } catch (e) { console.error('Load failed:', e); }
    return;
  }
  ['leads','pending','inbox','logs'].forEach(k => { try { eval(k+'=JSON.parse(localStorage.getItem(userKey(k))||"[]")'); } catch(e){} });
  try { const c = localStorage.getItem('los3_cfg'); if(c) cfg = {...cfg, ...JSON.parse(c)}; } catch(e){}
};
```

with:

```js
const save = () => {
  // Always persist cfg to localStorage (bootstraps persona defaults before /api/config responds)
  localStorage.setItem('los3_cfg', JSON.stringify(cfg));
  if (AUTH_MODE === 'backend' && AUTH_API()) return;
  ['leads','pending','inbox','logs'].forEach(k => localStorage.setItem(userKey(k), JSON.stringify(eval(k))));
};
const load = async () => {
  // Restore local-only settings from localStorage before server overwrite
  try { const c = localStorage.getItem('los3_cfg'); if(c) { const lc = JSON.parse(c); cfg = { ...cfg, ...lc }; } } catch(e){}

  if (AUTH_MODE === 'backend' && AUTH_API()) {
    try {
      const [leadsRes, emailsRes, inboxRes, configRes, logsRes, productRes] = await Promise.all([
        authFetch('/api/leads'),
        authFetch('/api/emails'),
        authFetch('/api/inbox'),
        authFetch('/api/config'),
        authFetch('/api/logs?limit=200'),
        authFetch('/api/product-profile')
      ]);
      if (leadsRes.ok) leads = (await leadsRes.json()).map(l => ({
        ...l,
        kontaktEmail: l.kontaktEmail || l.kontakt_email,
        firmenEmail: l.firmenEmail || l.firmen_email,
        email: l.email || l.kontakt_email || l.firmen_email,
        created: l.created || l.created_at
      }));
      if (emailsRes.ok) pending = (await emailsRes.json()).map(e => ({
        ...e,
        leadId: e.leadId || e.lead_id,
        leadName: e.leadName || e.lead_name,
        leadEmail: e.leadEmail || e.lead_email,
        contactName: e.contactName || e.contact_name,
        contactRole: e.contactRole || e.contact_role,
        contactPhone: e.contactPhone || e.contact_phone,
        catId: e.catId || e.cat_id,
        catName: e.catName || e.cat_name,
        resendId: e.resendId || e.resend_id,
        created: e.created || e.created_at
      }));
      if (inboxRes.ok) inbox = (await inboxRes.json()).map(i => ({
        ...i,
        leadId: i.leadId || i.lead_id,
        from: i.from || i.from_name,
        fromEmail: i.fromEmail || i.from_email,
        catName: i.catName || i.cat_name,
        origBody: i.origBody || i.orig_body,
        replyBody: i.replyBody || i.reply_body,
        time: i.time || i.received_at
      }));
      if (configRes.ok) {
        const c = await configRes.json();
        cfg.name = c.senderName || cfg.name;
        cfg.role = c.senderRole || cfg.role;
        cfg.co = c.senderCompany || cfg.co;
        cfg.sig = c.signature || cfg.sig;
        cfg.gFrom = c.senderEmail || cfg.gFrom;
        cfg.gName = c.senderDisplayName || cfg.gName;
        envDefaults = { apolloKey: c.hasApolloKey, perplexityKey: c.hasPerplexityKey };
      }
      if (logsRes.ok) {
        const serverLogs = await logsRes.json();
        logs = serverLogs.map(l => ({ msg: l.action + (l.details?.name ? ': ' + l.details.name : ''), t: 'info', time: l.created_at }));
      }
      if (productRes.ok) {
        const p = await productRes.json();
        if (p && (p.name || p.what || p.prompt)) try { localStorage.setItem('los3_product', JSON.stringify(p)); } catch(e){}
      }
    } catch (e) { console.error('Load failed:', e); }
    return;
  }
  ['leads','pending','inbox','logs'].forEach(k => { try { eval(k+'=JSON.parse(localStorage.getItem(userKey(k))||"[]")'); } catch(e){} });
  try { const c = localStorage.getItem('los3_cfg'); if(c) cfg = {...cfg, ...JSON.parse(c)}; } catch(e){}
};
```

- [ ] **Step 4: Manual verification**

With the Task 5 backend still running (`SENDER_NAME=TestSender` in `.env`), open `frontend/index.html` in a browser (adjust `BACKEND_URL` in the file to `http://localhost:3000` temporarily, or serve via `python3 -m http.server` from `frontend/` and use the browser devtools Network tab to confirm requests). Log in as the test user, open the Network tab, and confirm one request to `GET /api/config` and one to `GET /api/product-profile` fire on load, both returning `200`. Revert the temporary `BACKEND_URL` edit before committing.

- [ ] **Step 5: Commit**

```bash
git add frontend/index.html
git commit -m "Slim cfg to persona-only fields; load persona/product-profile from new endpoints"
```

---

### Task 9: Frontend — remove dead settings functions, update remaining call sites

**Files:**
- Modify: `frontend/index.html`

**Interfaces:**
- Consumes: `envDefaults.apolloKey` / `envDefaults.perplexityKey` (booleans, from Task 8).

- [ ] **Step 1: Remove the client-side webhook call in the agent's lead-save loop**

Replace:

```js
  for (const l of newLeads) {
    l.id=uid(); l.status='Neu'; l.created=new Date().toLocaleDateString(loc());
    const saved = await apiSave('/api/leads', 'POST', l);
    if (saved) l.id = saved.id;
    leads.unshift(l);
    if(cfg.whUrl) sendWH(l);
  }
```

with:

```js
  for (const l of newLeads) {
    l.id=uid(); l.status='Neu'; l.created=new Date().toLocaleDateString(loc());
    const saved = await apiSave('/api/leads', 'POST', l);
    if (saved) l.id = saved.id;
    leads.unshift(l);
  }
```

(The CRM webhook now fires server-side in `POST /api/leads`, per Task 6.)

- [ ] **Step 2: Simplify `llmViaBackend` — drop provider/model from the request body**

Replace:

```js
const llmViaBackend = async (prompt, max) => {
  const prov = cfg.provider || 'claude';
  const r = await authFetch('/api/llm', {
    method:'POST',
    body: JSON.stringify({ provider:prov, model:cfg.model, prompt, max_tokens:max })
  });
```

with:

```js
const llmViaBackend = async (prompt, max) => {
  const r = await authFetch('/api/llm', {
    method:'POST',
    body: JSON.stringify({ prompt, max_tokens:max })
  });
```

- [ ] **Step 3: Update the four `apolloKey`/`perplexityKey` gate call sites to use `envDefaults` only**

Replace:

```js
  if(!cfg.apolloKey && !envDefaults.apolloKey && !cfg.perplexityKey && !envDefaults.perplexityKey) {
    tlog('✗ Apollo oder Perplexity API-Key fehlt. Bitte unter Konfiguration einstellen.','lr');
    endAgent(); return;
  }
```

with:

```js
  if(!envDefaults.apolloKey && !envDefaults.perplexityKey) {
    tlog('✗ Apollo oder Perplexity API-Key fehlt. Bitte in der Server-.env eintragen.','lr');
    endAgent(); return;
  }
```

Replace:

```js
  if(cfg.perplexityKey || envDefaults.perplexityKey) {
```

with:

```js
  if(envDefaults.perplexityKey) {
```

Replace:

```js
  if(!orgs.length && (cfg.apolloKey || envDefaults.apolloKey)) {
```

with:

```js
  if(!orgs.length && envDefaults.apolloKey) {
```

Replace:

```js
const searchSelectedContacts = async () => {
  if(!cfg.apolloKey && !envDefaults.apolloKey) {
    showAlert('li-alrt', t('linkedin_no_api'), 'warn');
    return;
  }
```

with:

```js
const searchSelectedContacts = async () => {
  if(!envDefaults.apolloKey) {
    showAlert('li-alrt', t('linkedin_no_api'), 'warn');
    return;
  }
```

Replace:

```js
  if (cfg.apolloKey || envDefaults.apolloKey) {
    try {
      const results = await apolloSearch(lead);
```

with:

```js
  if (envDefaults.apolloKey) {
    try {
      const results = await apolloSearch(lead);
```

- [ ] **Step 4: Rename the Product Prompt save/load endpoints**

Replace:

```js
const saveProductPrompt = async () => {
  const data = {
    name:     V('eg-prodname'),
    target:   V('eg-target'),
    what:     V('eg-what'),
    problems: V('eg-problems'),
    usp:      V('eg-usp'),
    roi:      V('eg-roi'),
    pricing:  V('eg-pricing'),
    refs:     V('eg-refs'),
    prompt:   V('eg-prompt'),
    saved:    new Date().toLocaleString(loc())
  };
  if(!data.name && !data.what && !data.prompt) {
    showAlert('eg-alrt',t('msg_fill_product'),'err'); return;
  }
  localStorage.setItem('los3_product', JSON.stringify(data));
  await apiSave('/api/settings', 'PUT', { product: data });
  $('eg-saved-info').textContent = t('profile_saved_prefix') + data.saved;
  showAlert('eg-alrt',t('msg_profile_saved'),'ok');
  addLog(t('log_profile_saved') + (data.name||data.what||'').substring(0,40), 'ok');
};
```

with:

```js
const saveProductPrompt = async () => {
  const data = {
    name:     V('eg-prodname'),
    target:   V('eg-target'),
    what:     V('eg-what'),
    problems: V('eg-problems'),
    usp:      V('eg-usp'),
    roi:      V('eg-roi'),
    pricing:  V('eg-pricing'),
    refs:     V('eg-refs'),
    prompt:   V('eg-prompt'),
    saved:    new Date().toLocaleString(loc())
  };
  if(!data.name && !data.what && !data.prompt) {
    showAlert('eg-alrt',t('msg_fill_product'),'err'); return;
  }
  localStorage.setItem('los3_product', JSON.stringify(data));
  await apiSave('/api/product-profile', 'PUT', data);
  $('eg-saved-info').textContent = t('profile_saved_prefix') + data.saved;
  showAlert('eg-alrt',t('msg_profile_saved'),'ok');
  addLog(t('log_profile_saved') + (data.name||data.what||'').substring(0,40), 'ok');
};
```

Replace:

```js
const loadProductPrompt = async () => {
  // Try server first, then localStorage
  let d = null;
  try {
    const res = await authFetch('/api/settings');
    if(res.ok) {
      const s = await res.json();
      if(s.product && (s.product.name || s.product.what || s.product.prompt)) {
        d = s.product;
        localStorage.setItem('los3_product', JSON.stringify(d));
      }
    }
  } catch(e) {}
```

with:

```js
const loadProductPrompt = async () => {
  // Try server first, then localStorage
  let d = null;
  try {
    const res = await authFetch('/api/product-profile');
    if(res.ok) {
      const s = await res.json();
      if(s && (s.name || s.what || s.prompt)) {
        d = s;
        localStorage.setItem('los3_product', JSON.stringify(d));
      }
    }
  } catch(e) {}
```

- [ ] **Step 5: Slim `applyCfg`, delete `saveConfig`/`switchProvider`/`testOpenAI`/`testGemini`/`testClaude`/`testBackend`/`testWH`/`sendWH`**

Replace the full block from the `// ─── CONFIG ───` comment through the `sendWH` function (immediately before the `// ─── EXPORT ───` comment):

```js
// ─── CONFIG ───────────────────────────────────────────────────────────────────
const applyCfg = () => {
  if(cfg.provider) { const s=$('c-provider'); if(s) s.value=cfg.provider; switchProvider(cfg.provider); }
  if(cfg.claudeKey){$('c-key').value=cfg.claudeKey;setPill('p-claude',true);$('pill-api').className='pill pill-on';$('pill-api').textContent='● '+cfg.provider.toUpperCase();}
  else if(envDefaults.claudeKey && cfg.provider==='claude'){setPill('p-claude',true);$('pill-api').className='pill pill-on';$('pill-api').textContent='● ENV';$('c-key').placeholder='Server-Key gesetzt';}
  if(cfg.openaiKey) $('c-openai-key').value=cfg.openaiKey;
  else if(envDefaults.openaiKey) $('c-openai-key').placeholder='Server-Key gesetzt';
  if(cfg.geminiKey) $('c-gemini-key').value=cfg.geminiKey;
  else if(envDefaults.geminiKey) $('c-gemini-key').placeholder='Server-Key gesetzt';
  if(cfg.model) $('c-model').value=cfg.model;
  if(cfg.name) $('c-name').value=cfg.name;
  if(cfg.role) $('c-role').value=cfg.role;
  if(cfg.co) $('c-co').value=cfg.co;
  if(cfg.sig) $('c-sig').value=cfg.sig;
  if(cfg.gFrom){$('c-gfrom').value=cfg.gFrom;setPill('p-gmail',true);}
  if(cfg.gName) $('c-gname').value=cfg.gName;
  if(cfg.whUrl){$('c-wh').value=cfg.whUrl;setPill('p-wh',true);}
  if(cfg.backendUrl){$('c-backend').value=cfg.backendUrl;setPill('p-backend',true);}
  if(cfg.apolloKey){$('c-apollo').value=cfg.apolloKey;setPill('p-apollo',true);}
  else if(envDefaults.apolloKey){setPill('p-apollo',true);$('c-apollo').placeholder='Server-Key gesetzt';}
  if(cfg.hunterKey){$('c-hunter').value=cfg.hunterKey;setPill('p-hunter',true);}
  else if(envDefaults.hunterKey){setPill('p-hunter',true);$('c-hunter').placeholder='Server-Key gesetzt';}
  if(cfg.perplexityKey){$('c-perplexity').value=cfg.perplexityKey;setPill('p-perplexity',true);}
  else if(envDefaults.perplexityKey){setPill('p-perplexity',true);$('c-perplexity').placeholder='Server-Key gesetzt';}
  if(cfg.resendKey){$('c-resend').value=cfg.resendKey;setPill('p-resend',true);}
  else if(envDefaults.resendKey){setPill('p-resend',true);$('c-resend').placeholder='Server-Key gesetzt';}
  if(cfg.lang){$('c-lang').value=cfg.lang;}
  // load saved product prompt and fill fields
  const raw = localStorage.getItem('los3_product');
  if(raw) {
    try {
      const d = JSON.parse(raw);
      if(d.saved) $('eg-saved-info').textContent=t('profile_last_saved')+d.saved;
      fillProductFields(d);
    } catch(e){}
  }
};
const saveConfig = async () => {
  cfg.provider=V('c-provider')||'claude';
  const key=V('c-key'); if(key) cfg.claudeKey=key;
  const okey=V('c-openai-key'); if(okey) cfg.openaiKey=okey;
  const gkey=V('c-gemini-key'); if(gkey) cfg.geminiKey=gkey;
  cfg.model=V('c-model'); cfg.name=V('c-name'); cfg.role=V('c-role');
  cfg.co=V('c-co'); cfg.sig=V('c-sig'); cfg.gFrom=V('c-gfrom'); cfg.gName=V('c-gname'); cfg.whUrl=V('c-wh');
  if(V('c-apollo')) cfg.apolloKey=V('c-apollo');
  if(V('c-hunter')) cfg.hunterKey=V('c-hunter');
  if(V('c-perplexity')) cfg.perplexityKey=V('c-perplexity');
  if(V('c-resend')) cfg.resendKey=V('c-resend');
  if(V('c-backend')) cfg.backendUrl=V('c-backend').replace(/\/$/,'');
  cfg.lang=V('c-lang')||'de';
  save();
  await apiSave('/api/settings', 'PUT', { cfg });
  if(cfg.claudeKey||envDefaults.claudeKey){setPill('p-claude',true);$('pill-api').className='pill pill-on';$('pill-api').textContent=cfg.claudeKey?'● API':'● ENV';}
  if(cfg.apolloKey||envDefaults.apolloKey){setPill('p-apollo',true);}
  if(cfg.perplexityKey||envDefaults.perplexityKey) setPill('p-perplexity',true);
  if(cfg.resendKey||envDefaults.resendKey) setPill('p-resend',true);
  if(cfg.gFrom) setPill('p-gmail',true);
  if(cfg.whUrl) setPill('p-wh',true);
  showAlert('cfg-alrt',t('msg_config_saved'),'ok');
  addLog('Konfiguration gespeichert','ok');
};
const switchProvider = (prov) => {
  ['claude','openai','gemini'].forEach(p => {
    const el = $('key-'+p); if(el) el.style.display = p===prov?'':'none';
  });
  const modelSel = $('c-model');
  if(!modelSel) return;
  const models = {
    claude: [
      {v:'claude-sonnet-4-20250514', l:'Claude Sonnet 4 ' + t('model_recommended')},
      {v:'claude-opus-4-20250514',   l:'Claude Opus 4'},
      {v:'claude-haiku-4-5-20251001',l:'Claude Haiku 4.5 ' + t('model_fast')},
    ],
    openai: [
      {v:'gpt-4o',       l:'GPT-4o ' + t('model_recommended')},
      {v:'gpt-4o-mini',  l:'GPT-4o Mini ' + t('model_fast_cheap')},
      {v:'gpt-4-turbo',  l:'GPT-4 Turbo'},
    ],
    gemini: [
      {v:'gemini-1.5-flash', l:'Gemini 1.5 Flash ' + t('model_recommended_free')},
      {v:'gemini-1.5-pro',   l:'Gemini 1.5 Pro'},
      {v:'gemini-2.0-flash', l:'Gemini 2.0 Flash'},
    ],
  };
  const opts = models[prov] || models.claude;
  modelSel.innerHTML = opts.map(o=>`<option value="${o.v}">${o.l}</option>`).join('');
  cfg.provider = prov;
};

const testOpenAI = async () => {
  const key=V('c-openai-key'); if(!key){alert('OpenAI API Key eintragen');return;}
  try {
    const r=await authFetch('/api/llm/test',{method:'POST',body:JSON.stringify({provider:'openai',key})});
    const d=await r.json();
    if(d.ok){cfg.openaiKey=key;save();apiSave('/api/settings','PUT',{cfg});setPill('p-claude',true);$('pill-api').className='pill pill-on';$('pill-api').textContent='● OPENAI';showAlert('cfg-alrt',t('msg_openai_ok'),'ok');addLog('OpenAI API: OK','ok');}
    else showAlert('cfg-alrt','OpenAI: '+t('msg_invalid_key')+(d.status||'?')+')','err');
  } catch(e){showAlert('cfg-alrt','Fehler: '+e.message,'err');}
};

const testGemini = async () => {
  const key=V('c-gemini-key'); if(!key){alert('Gemini API Key eintragen');return;}
  try {
    const r=await authFetch('/api/llm/test',{method:'POST',body:JSON.stringify({provider:'gemini',key})});
    const d=await r.json();
    if(d.ok){cfg.geminiKey=key;save();apiSave('/api/settings','PUT',{cfg});setPill('p-claude',true);$('pill-api').className='pill pill-on';$('pill-api').textContent='● GEMINI';showAlert('cfg-alrt',t('msg_gemini_ok'),'ok');addLog('Gemini API: OK','ok');}
    else showAlert('cfg-alrt','Gemini: '+t('msg_invalid_key')+(d.status||'?')+')','err');
  } catch(e){showAlert('cfg-alrt','Fehler: '+e.message,'err');}
};

const testClaude = async () => {
  const key=V('c-key'); if(!key){alert('Key eintragen');return;}
  try {
    const r=await authFetch('/api/llm/test',{method:'POST',body:JSON.stringify({provider:'claude',key})});
    const txt=await r.text();
    console.log('testClaude response:', r.status, txt);
    if(!r.ok){showAlert('cfg-alrt',t('msg_server_error')+r.status+'): '+txt,'err');return;}
    if(!txt){showAlert('cfg-alrt',t('msg_empty_response')+r.status+')','err');return;}
    const d=JSON.parse(txt);
    if(d.ok){cfg.claudeKey=key;save();apiSave('/api/settings','PUT',{cfg});setPill('p-claude',true);$('pill-api').className='pill pill-on';$('pill-api').textContent='● API';showAlert('cfg-alrt',t('msg_claude_ok'),'ok');addLog('Claude API OK','ok');}
    else showAlert('cfg-alrt',t('msg_invalid_key')+(d.status||'?')+')' + (d.error ? ': '+d.error : ''),'err');
  } catch(e){showAlert('cfg-alrt',t('msg_conn_error')+e.message,'err');}
};
const testBackend = async () => {
  const url = V('c-backend').replace(/\/$/, '');
  if(!url) { showAlert('cfg-alrt', t('msg_backend_enter'), 'warn'); return; }
  try {
    const res = await fetch(url + '/api/health');
    if(res.ok) {
      cfg.backendUrl = url; save();
      setPill('p-backend', true);
      // Switch to backend mode
      showAlert('cfg-alrt', t('msg_backend_connected'), 'ok');
      addLog('Backend verbunden: ' + url, 'ok');
    } else {
      showAlert('cfg-alrt', t('msg_backend_bad') + res.status + ')', 'err');
    }
  } catch(e) { showAlert('cfg-alrt', t('msg_backend_unreachable') + e.message, 'err'); }
};

const testWH = async () => {
  const url=V('c-wh'); if(!url){alert('URL eintragen');return;}
  try{await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({test:true,source:'LeadOS'})});cfg.whUrl=url;save();setPill('p-wh',true);showAlert('cfg-alrt',t('msg_webhook_ok'),'ok');}
  catch(e){showAlert('cfg-alrt',t('msg_webhook_fail'),'err');}
};
const sendWH = async data => { if(!cfg.whUrl) return; try{await fetch(cfg.whUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,source:'LeadOS',ts:new Date().toISOString()})});}catch(e){} };
```

with:

```js
// ─── CONFIG ───────────────────────────────────────────────────────────────────
const applyCfg = () => {
  // load saved product prompt and fill fields
  const raw = localStorage.getItem('los3_product');
  if(raw) {
    try {
      const d = JSON.parse(raw);
      if(d.saved) $('eg-saved-info').textContent=t('profile_last_saved')+d.saved;
      fillProductFields(d);
    } catch(e){}
  }
};
```

- [ ] **Step 6: Delete the `nukeAll` and `renderUsersList` functions**

`nukeAll` only existed to back the deleted "Meine Daten löschen" button. `renderUsersList` only existed to back the deleted legacy "Nutzer-Verwaltung" mini-panel (`users-list`/`p-admin`, both removed in Task 7) — it is a *different* function from `renderTeam`, which backs the real Team page and is unaffected. Its only two call sites (`nav()`'s now-removed `'config'` branch, fixed in Task 7 Step 1; and `switchLang`, fixed in the previous step) are already gone, so it is fully dead.

Replace:

```js
const expJSON = () => { dl('leados_'+ds()+'.json','data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({leads,pending,inbox,logs,cfg,exported:new Date().toISOString()},null,2))); addLog('JSON exportiert'); };
const impJSON = () => {
  const inp=document.createElement('input');inp.type='file';inp.accept='.json';
  inp.onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
    r.onload=async ev=>{try{const d=JSON.parse(ev.target.result);
      if(d.leads) {
        if (AUTH_MODE === 'backend' && AUTH_API()) {
          const res = await authFetch('/api/leads/import', { method: 'POST', body: JSON.stringify(d.leads) });
          if (res.ok) { const data = await res.json(); leads = [...(data.leads||[]), ...leads]; }
        } else {
          leads=d.leads;
        }
      }
      if(d.pending)pending=d.pending;if(d.inbox)inbox=d.inbox;if(d.logs)logs=d.logs;
      if(d.cfg)cfg={...cfg,...d.cfg};
      save();applyCfg();ui();renderLeads();renderApprove();renderInbox();renderLog();renderCatGrid();renderLeadPicker();
      alert('Import OK: '+leads.length+' Leads');addLog('Import: '+leads.length+' Leads','ok');
    }catch(e){alert('Fehler: '+e.message);}};r.readAsText(f);};inp.click();
};
const nukeAll = () => { if(!confirm('Alle DEINE Daten löschen? (Andere Nutzer bleiben unberührt)'))return; leads=[];pending=[];inbox=[];logs=[];save();ui();renderLeads();renderApprove();renderInbox();renderLog();addLog('Alle Daten gelöscht','warn'); };

// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────
const renderUsersList = () => {
  const session = getSession();
  if(!session) return;
  const isAdmin = session.role === 'admin';
  const adminPill = $('p-admin');
  if(adminPill) {
    if(isAdmin) { adminPill.style.display=''; adminPill.className='pill pill-purple'; adminPill.textContent=t('team_admin_badge'); }
    else { adminPill.style.display='none'; }
  }
  const users = getUsers();
  const el = $('users-list'); if(!el) return;
  if(!isAdmin) {
    el.innerHTML = `<div style="font-size:12px;color:var(--t2)">${t('team_logged_in_as')}: <strong style="color:var(--t1)">${esc(session.name)}</strong> &nbsp;·&nbsp; ${esc(session.email)}</div>`;
    return;
  }
  el.innerHTML = users.map(u => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--s3)">
      <div style="width:28px;height:28px;border-radius:50%;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--green);flex-shrink:0">
        ${esc((u.name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2))}
      </div>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:700;color:var(--t1)">${esc(u.name)}
          ${u.role==='admin'?'<span class="pill pill-purple" style="font-size:9px;margin-left:6px">ADMIN</span>':''}
          ${u.id===session.userId?'<span class="pill pill-on" style="font-size:9px;margin-left:4px">ICH</span>':''}
        </div>
        <div style="font-size:10px;color:var(--t3)">${esc(u.email)} &nbsp;·&nbsp; seit ${new Date(u.created||Date.now()).toLocaleDateString(loc())}</div>
      </div>
      ${u.id !== session.userId ? `<button class="btn btn-sm btn-r" onclick="deleteUser('${u.id}')">Löschen</button>` : ''}
    </div>`).join('') || '<div style="font-size:12px;color:var(--t3)">' + t('team_no_other_users') + '</div>';
};
```

with:

```js
const expJSON = () => { dl('leados_'+ds()+'.json','data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({leads,pending,inbox,logs,cfg,exported:new Date().toISOString()},null,2))); addLog('JSON exportiert'); };
const impJSON = () => {
  const inp=document.createElement('input');inp.type='file';inp.accept='.json';
  inp.onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
    r.onload=async ev=>{try{const d=JSON.parse(ev.target.result);
      if(d.leads) {
        if (AUTH_MODE === 'backend' && AUTH_API()) {
          const res = await authFetch('/api/leads/import', { method: 'POST', body: JSON.stringify(d.leads) });
          if (res.ok) { const data = await res.json(); leads = [...(data.leads||[]), ...leads]; }
        } else {
          leads=d.leads;
        }
      }
      if(d.pending)pending=d.pending;if(d.inbox)inbox=d.inbox;if(d.logs)logs=d.logs;
      if(d.cfg)cfg={...cfg,...d.cfg};
      save();applyCfg();ui();renderLeads();renderApprove();renderInbox();renderLog();renderCatGrid();renderLeadPicker();
      alert('Import OK: '+leads.length+' Leads');addLog('Import: '+leads.length+' Leads','ok');
    }catch(e){alert('Fehler: '+e.message);}};r.readAsText(f);};inp.click();
};
```

Note: `deleteUserAccount` (defined right after where `renderUsersList` used to be, operating on `getUsers()`/`saveUsers()`) is pre-existing dead code unrelated to this change — it has no call sites before or after this edit. Leave it in place per the plan's global constraint on not pruning unrelated dead code.

- [ ] **Step 7: Delete `testApollo`/`testHunter`/`testPerplexity`**

Replace:

```js
// Apollo test (via backend proxy)
const testApollo = async () => {
  const key = V('c-apollo');
  if(!key) { showAlert('cfg-alrt', t('msg_apollo_enter'), 'warn'); return; }
  try {
    const res = await fetch((cfg.backendUrl||'')+'/api/apollo/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    if(data.ok) {
      cfg.apolloKey = key; save();
      setPill('p-apollo', true);
      showAlert('cfg-alrt', t('msg_apollo_ok'), 'ok');
      addLog('Apollo API: OK', 'ok');
      await apiSave('/api/settings', 'PUT', { cfg });
    } else {
      showAlert('cfg-alrt', 'Apollo: ' + t('msg_invalid_key') + ' (' + (data.status||data.error) + ')', 'err');
    }
  } catch(e) { showAlert('cfg-alrt', 'Apollo-Fehler: ' + e.message, 'err'); }
};

// Hunter.io test (via backend proxy)
const testHunter = async () => {
  const key = V('c-hunter');
  if(!key) { showAlert('cfg-alrt', 'Hunter.io API-Key eingeben.', 'warn'); return; }
  try {
    const res = await fetch((cfg.backendUrl||'')+'/api/hunter/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    if(data.ok) {
      cfg.hunterKey = key; save();
      setPill('p-hunter', true);
      showAlert('cfg-alrt', 'Hunter.io: Verbindung OK', 'ok');
      addLog('Hunter.io API: OK', 'ok');
      await apiSave('/api/settings', 'PUT', { cfg });
    } else {
      showAlert('cfg-alrt', 'Hunter.io: ' + t('msg_invalid_key') + ' (' + (data.status||data.error) + ')', 'err');
    }
  } catch(e) { showAlert('cfg-alrt', 'Hunter.io-Fehler: ' + e.message, 'err'); }
};

// Perplexity test (via backend proxy)
const testPerplexity = async () => {
  const key = V('c-perplexity');
  if(!key) { showAlert('cfg-alrt', 'Perplexity API-Key eingeben.', 'warn'); return; }
  try {
    const res = await fetch((cfg.backendUrl||'')+'/api/perplexity/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    if(data.ok) {
      cfg.perplexityKey = key; save();
      setPill('p-perplexity', true);
      showAlert('cfg-alrt', 'Perplexity API verbunden!', 'ok');
      addLog('Perplexity API: OK', 'ok');
      await apiSave('/api/settings', 'PUT', { cfg });
    } else {
      showAlert('cfg-alrt', 'Perplexity: Ungültiger Key (' + (data.status||data.error) + ')', 'err');
    }
  } catch(e) { showAlert('cfg-alrt', 'Perplexity-Fehler: ' + e.message, 'err'); }
};


```

with an empty string (delete entirely, leaving one blank line between the preceding `apolloSearch` function and the `// ─── LEGACY MIGRATION ───` comment that follows).

- [ ] **Step 8: Remove the `switchProvider` reference and settings persistence from `switchLang`**

Replace:

```js
const switchLang = (lang) => {
  cfg.lang = lang;
  save();
  apiSave('/api/settings', 'PUT', { cfg });
  applyLang();
  // Re-render dynamic elements that use t()
  if(typeof switchProvider === 'function') switchProvider(cfg.provider || 'claude');
  if(typeof renderUsersList === 'function') renderUsersList();
  if(typeof renderTeam === 'function') renderTeam();
};
```

with:

```js
const switchLang = (lang) => {
  cfg.lang = lang;
  save();
  applyLang();
  // Re-render dynamic elements that use t()
  if(typeof renderTeam === 'function') renderTeam();
};
```

- [ ] **Step 9: Grep-verify no dangling references remain**

Run:

```bash
grep -nE "cfg\.(claudeKey|openaiKey|geminiKey|apolloKey|hunterKey|perplexityKey|resendKey|backendUrl|provider|model|whUrl)\b" frontend/index.html
grep -n "switchProvider\|saveConfig\|testOpenAI\|testGemini\|testClaude\|testBackend\|testWH\|testApollo\|testHunter\|testPerplexity\|sendWH\|nukeAll\|renderUsersList\|/api/settings" frontend/index.html
```

Expected: both commands print nothing (no matches).

- [ ] **Step 10: Manual browser walkthrough**

Serve `frontend/` locally (`python3 -m http.server 5500` from `frontend/`), point `BACKEND_URL` at the Task 5/6 local backend temporarily, open in a browser, log in, and click through: Agent page (run a search — should no longer error about a missing `Konfiguration` gate wording change), Email Gen page (Save/Load product prompt — confirm it round-trips via `/api/product-profile` in the Network tab), LinkedIn Prospecting page, Inbox page. Confirm zero JS console errors on any page. Revert the temporary `BACKEND_URL` edit before committing.

- [ ] **Step 11: Commit**

```bash
git add frontend/index.html
git commit -m "Remove dead settings functions; update call sites to env-backed config"
```

---

### Task 10: Frontend — add a standalone header language toggle

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add the toggle to the top bar**

Replace:

```html
  <div class="top-right">
    <div class="user-pill"><div class="user-avatar" id="user-avatar">?</div><span id="user-name-lbl" style="font-size:11px;color:var(--t2)"></span><button class="tbtn" id="btn-logout" onclick="doLogout()" style="font-size:10px;color:var(--t3);margin-left:4px" title="Ausloggen">⏻</button></div>
```

with:

```html
  <div class="top-right">
    <select id="lang-toggle" class="tbtn" onchange="switchLang(this.value)" style="font-size:10px;color:var(--t3);background:transparent;border:1px solid var(--s3);border-radius:4px">
      <option value="de">DE</option>
      <option value="en">EN</option>
    </select>
    <div class="user-pill"><div class="user-avatar" id="user-avatar">?</div><span id="user-name-lbl" style="font-size:11px;color:var(--t2)"></span><button class="tbtn" id="btn-logout" onclick="doLogout()" style="font-size:10px;color:var(--t3);margin-left:4px" title="Ausloggen">⏻</button></div>
```

- [ ] **Step 2: Sync its value in `applyLang()`**

Replace:

```js
const applyLang = () => {
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.getAttribute('data-t');
    const val = t(key);
    if (el.tagName === 'OPTION') el.textContent = val;
    else if (el.tagName === 'INPUT' && el.type !== 'hidden') { /* skip inputs */ }
    else el.textContent = val;
  });
  document.querySelectorAll('[data-tp]').forEach(el => {
    const key = el.getAttribute('data-tp');
    const val = t(key);
    if (val !== key) el.placeholder = val;
  });
  const lo = $('btn-logout'); if(lo) lo.title = t('logout_title');
};
```

with:

```js
const applyLang = () => {
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.getAttribute('data-t');
    const val = t(key);
    if (el.tagName === 'OPTION') el.textContent = val;
    else if (el.tagName === 'INPUT' && el.type !== 'hidden') { /* skip inputs */ }
    else el.textContent = val;
  });
  document.querySelectorAll('[data-tp]').forEach(el => {
    const key = el.getAttribute('data-tp');
    const val = t(key);
    if (val !== key) el.placeholder = val;
  });
  const lo = $('btn-logout'); if(lo) lo.title = t('logout_title');
  const lt = $('lang-toggle'); if(lt) lt.value = cfg.lang || 'de';
};
```

- [ ] **Step 3: Manual verification**

Open the app in a browser, log in, switch the new header dropdown from DE to EN and confirm nav labels and page text switch language immediately; reload the page and confirm it stays on EN (persisted via `localStorage.los3_cfg`).

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html
git commit -m "Add standalone header language toggle, decoupled from removed Settings page"
```

---

## Final Verification (after all tasks)

- [ ] Run `node --check` on every modified/created backend `.js` file at once:

```bash
find backend/src -name '*.js' -exec node --check {} \;
```

Expected: no output.

- [ ] Run the two grep checks from Task 9 Step 8 once more against the final state of `frontend/index.html` — both must still print nothing.

- [ ] Fresh-start smoke test:

```bash
docker compose down -v && docker compose up -d db
cd backend && cp .env.example .env
# fill in JWT_SECRET, CLAUDE_API_KEY (or another provider), SENDER_NAME
npm run migrate   # should apply 001-004 cleanly on a brand-new database
npm run dev
```

Then serve `frontend/` and walk through: register → login → Agent search → Email Gen save/load product prompt → generate + approve an email → Inbox reply → Leads export/import → Team page (as the first-registered admin) → language toggle. Confirm no console errors and no page still references "Konfiguration"/Settings.

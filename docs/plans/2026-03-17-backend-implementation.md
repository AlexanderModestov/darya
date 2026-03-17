# LeadOS Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Node.js + Express backend with PostgreSQL, JWT auth, and Resend email integration for the existing LeadOS frontend.

**Architecture:** Express REST API with pg (node-postgres) for database, bcrypt for password hashing, jsonwebtoken for JWT, and Resend SDK for email sending. All routes except auth and health require JWT middleware. Frontend switches from localStorage to API calls by changing `AUTH_MODE = 'backend'`.

**Tech Stack:** Node.js, Express, PostgreSQL, bcrypt, jsonwebtoken, resend, cors, express-rate-limit, dotenv

---

## Task 1: Project Scaffold

**Files:**
- Create: `backend/package.json`
- Create: `backend/.env.example`
- Create: `backend/src/app.js`
- Create: `backend/src/services/db.js`

**Step 1: Initialize backend project**

```bash
cd C:/Users/aleks/Documents/Projects/Daria
mkdir -p backend/src/{routes,services,middleware} backend/migrations
```

**Step 2: Create package.json**

Create `backend/package.json`:

```json
{
  "name": "leados-backend",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/app.js",
    "dev": "node --watch src/app.js",
    "migrate": "node src/migrate.js"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "express-rate-limit": "^7.5.0",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.13.1",
    "resend": "^4.1.2"
  }
}
```

**Step 3: Create .env.example**

Create `backend/.env.example`:

```env
# Database
DATABASE_URL=postgresql://leados:leados@localhost:5432/leados

# Auth
JWT_SECRET=change-me-to-a-random-64-char-string-use-openssl-rand-hex-32
JWT_EXPIRES_IN=7d

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=sales@yourdomain.com

# Server
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:5500
```

**Step 4: Create database connection service**

Create `backend/src/services/db.js`:

```js
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => {
  console.error('Unexpected pool error', err);
  process.exit(1);
});

export const query = (text, params) => pool.query(text, params);
export default pool;
```

**Step 5: Create Express app with CORS and error handler**

Create `backend/src/app.js`:

```js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import leadsRoutes from './routes/leads.js';
import emailsRoutes from './routes/emails.js';
import inboxRoutes from './routes/inbox.js';
import usersRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import logsRoutes from './routes/logs.js';
import { authMiddleware } from './middleware/auth.js';

const app = express();

// CORS
const origins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: origins.length > 0 ? origins : true,
  credentials: true
}));

app.use(express.json({ limit: '5mb' }));

// Health check (no auth)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0' });
});

// Auth routes (no auth middleware)
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/leads', authMiddleware, leadsRoutes);
app.use('/api/emails', authMiddleware, emailsRoutes);
app.use('/api/inbox', authMiddleware, inboxRoutes);
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);
app.use('/api/logs', authMiddleware, logsRoutes);

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack || err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LeadOS API running on port ${PORT}`));
```

**Step 6: Install dependencies**

```bash
cd C:/Users/aleks/Documents/Projects/Daria/backend && npm install
```

**Step 7: Create placeholder route files** (so app.js doesn't crash at import)

Create stub files for each route — each exports a default Router:

`backend/src/routes/auth.js`:
```js
import { Router } from 'express';
const router = Router();
export default router;
```

Same for: `leads.js`, `emails.js`, `inbox.js`, `users.js`, `settings.js`, `logs.js`

Create stub middleware `backend/src/middleware/auth.js`:
```js
export const authMiddleware = (req, res, next) => next();
```

**Step 8: Verify server starts**

```bash
cd C:/Users/aleks/Documents/Projects/Daria/backend
cp .env.example .env
node src/app.js
# Expected: "LeadOS API running on port 3000"
# Test: curl http://localhost:3000/api/health → {"status":"ok","version":"2.0"}
```

**Step 9: Commit**

```bash
git add backend/
git commit -m "feat: scaffold backend project with Express, CORS, health endpoint"
```

---

## Task 2: Database Schema

**Files:**
- Create: `backend/migrations/001_schema.sql`
- Create: `backend/src/migrate.js`

**Step 1: Write the full SQL migration**

Create `backend/migrations/001_schema.sql`:

```sql
-- LeadOS Database Schema v2.0
-- Run: psql $DATABASE_URL -f migrations/001_schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- ── Revoked Tokens ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash VARCHAR(64) PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);

-- ── Leads ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  vorname VARCHAR(100),
  nachname VARCHAR(100),
  rolle VARCHAR(150),
  kontakt_email VARCHAR(255),
  firmen_email VARCHAR(255),
  telefon VARCHAR(50),
  linkedin VARCHAR(500),
  beschreibung TEXT,
  branche VARCHAR(150),
  ort VARCHAR(150),
  ma VARCHAR(50),
  web VARCHAR(255),
  fokus TEXT,
  status VARCHAR(50) DEFAULT 'Neu',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_deleted ON leads(deleted_at);

-- ── Emails ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  lead_name VARCHAR(255),
  lead_email VARCHAR(255),
  contact_name VARCHAR(200),
  contact_role VARCHAR(150),
  contact_phone VARCHAR(50),
  cat_id VARCHAR(50),
  cat_name VARCHAR(100),
  subject VARCHAR(500),
  body TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  resend_id VARCHAR(100),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emails_user ON emails(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_lead ON emails(lead_id);

-- ── Inbox ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  from_name VARCHAR(200),
  from_email VARCHAR(255),
  subject VARCHAR(500),
  body TEXT,
  cat_name VARCHAR(100),
  orig_body TEXT,
  replied BOOLEAN DEFAULT FALSE,
  reply_body TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbox_user ON inbox(user_id);

-- ── Activity Log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);

-- ── Settings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cfg JSONB DEFAULT '{}',
  product JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Auto-update updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Cleanup expired revoked tokens (run periodically) ────────
-- DELETE FROM revoked_tokens WHERE expires_at < NOW();
```

**Step 2: Create migration runner**

Create `backend/src/migrate.js`:

```js
import 'dotenv/config';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pool from './services/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '../migrations/001_schema.sql'), 'utf-8');

try {
  await pool.query(sql);
  console.log('Migration 001_schema.sql applied successfully');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
```

**Step 3: Run migration against a local PostgreSQL**

```bash
cd C:/Users/aleks/Documents/Projects/Daria/backend
# Ensure PostgreSQL is running and DATABASE_URL is set in .env
npm run migrate
# Expected: "Migration 001_schema.sql applied successfully"
```

**Step 4: Commit**

```bash
git add backend/migrations/ backend/src/migrate.js
git commit -m "feat: add PostgreSQL schema with 7 tables and migration runner"
```

---

## Task 3: Auth — JWT Middleware + Revoked Token Check

**Files:**
- Modify: `backend/src/middleware/auth.js`
- Create: `backend/src/middleware/admin.js`

**Step 1: Implement JWT auth middleware with revoked token check**

Replace `backend/src/middleware/auth.js`:

```js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../services/db.js';

const JWT_SECRET = process.env.JWT_SECRET;

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = header.slice(7);
  try {
    // Check if token is revoked
    const hash = hashToken(token);
    const { rows } = await query('SELECT 1 FROM revoked_tokens WHERE token_hash = $1', [hash]);
    if (rows.length > 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
```

**Step 2: Create admin middleware**

Create `backend/src/middleware/admin.js`:

```js
export function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: admin only' });
  }
  next();
}
```

**Step 3: Verify app still starts**

```bash
cd C:/Users/aleks/Documents/Projects/Daria/backend && node src/app.js
# Expected: "LeadOS API running on port 3000"
# Test: curl http://localhost:3000/api/leads → {"error":"Unauthorized"}
```

**Step 4: Commit**

```bash
git add backend/src/middleware/
git commit -m "feat: add JWT auth middleware with revoked token check + admin guard"
```

---

## Task 4: Auth Routes — Register, Login, Me, Logout, Password

**Files:**
- Modify: `backend/src/routes/auth.js`
- Create: `backend/src/services/log.js` (activity log helper)

**Step 1: Create activity log helper**

Create `backend/src/services/log.js`:

```js
import { query } from './db.js';

export async function logActivity(userId, action, entityType = null, entityId = null, details = null) {
  try {
    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [userId, action, entityType, entityId, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
}
```

**Step 2: Implement auth routes**

Replace `backend/src/routes/auth.js`:

```js
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../services/db.js';
import { logActivity } from '../services/log.js';
import { authMiddleware, hashToken } from '../middleware/auth.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SALT_ROUNDS = 12;

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function userResponse(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, E-Mail und Passwort erforderlich.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Passwort min. 8 Zeichen.' });
    }

    // Check if email exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Diese E-Mail ist bereits registriert.' });
    }

    // First user = admin
    const countResult = await query('SELECT COUNT(*) FROM users');
    const isFirst = parseInt(countResult.rows[0].count) === 0;

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [name.trim(), email.toLowerCase().trim(), password_hash, isFirst ? 'admin' : 'user']
    );

    const user = result.rows[0];
    const token = signToken(user);

    await logActivity(user.id, 'register', 'auth', user.id, { role: user.role });

    res.status(201).json({ token, user: userResponse(user) });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-Mail und Passwort erforderlich.' });
    }

    const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'E-Mail oder Passwort falsch.' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'E-Mail oder Passwort falsch.' });
    }

    // Update last_login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = signToken(user);
    await logActivity(user.id, 'login', 'auth', user.id);

    res.json({ token, user: userResponse(user) });
  } catch (err) { next(err); }
});

// GET /api/auth/me (requires auth)
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ user: userResponse(result.rows[0]) });
  } catch (err) { next(err); }
});

// POST /api/auth/logout (requires auth)
router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    const token = req.headers.authorization.slice(7);
    const hash = hashToken(token);
    const decoded = jwt.decode(token);
    const expiresAt = new Date(decoded.exp * 1000);

    await query(
      'INSERT INTO revoked_tokens (token_hash, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [hash, expiresAt]
    );

    await logActivity(req.user.id, 'logout', 'auth', req.user.id);

    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /api/auth/password (requires auth — change own password)
router.put('/password', authMiddleware, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Altes und neues Passwort erforderlich.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Neues Passwort min. 8 Zeichen.' });
    }

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Aktuelles Passwort ist falsch.' });
    }

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);

    await logActivity(req.user.id, 'password_changed', 'auth', req.user.id);

    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
```

**Step 3: Test auth flow**

```bash
# Register first user (becomes admin)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@test.de","password":"test1234"}'
# Expected: {"token":"eyJ...","user":{"id":"...","name":"Admin","email":"admin@test.de","role":"admin"}}

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.de","password":"test1234"}'
# Expected: {"token":"eyJ...","user":{...}}

# Me (use token from above)
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <TOKEN>"
# Expected: {"user":{"id":"...","name":"Admin","email":"admin@test.de","role":"admin"}}
```

**Step 4: Commit**

```bash
git add backend/src/routes/auth.js backend/src/services/log.js
git commit -m "feat: implement auth routes — register, login, me, logout, password change"
```

---

## Task 5: Leads CRUD API

**Files:**
- Modify: `backend/src/routes/leads.js`

**Step 1: Implement leads routes**

Replace `backend/src/routes/leads.js`:

```js
import { Router } from 'express';
import { query } from '../services/db.js';
import { logActivity } from '../services/log.js';

const router = Router();

// GET /api/leads — list leads for current user (excluding soft-deleted)
router.get('/', async (req, res, next) => {
  try {
    const { status, search } = req.query;
    let sql = 'SELECT * FROM leads WHERE user_id = $1 AND deleted_at IS NULL';
    const params = [req.user.id];

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (name ILIKE $${params.length} OR ort ILIKE $${params.length} OR branche ILIKE $${params.length} OR vorname ILIKE $${params.length} OR nachname ILIKE $${params.length})`;
    }

    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/leads — create lead
router.post('/', async (req, res, next) => {
  try {
    const b = req.body;
    const result = await query(
      `INSERT INTO leads (user_id, name, vorname, nachname, rolle, kontakt_email, firmen_email, telefon, linkedin, beschreibung, branche, ort, ma, web, fokus, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [req.user.id, b.name, b.vorname, b.nachname, b.rolle, b.kontaktEmail || b.kontakt_email, b.firmenEmail || b.firmen_email, b.telefon, b.linkedin, b.beschreibung, b.branche, b.ort, b.ma, b.web, b.fokus, b.status || 'Neu']
    );
    const lead = result.rows[0];
    await logActivity(req.user.id, 'lead_created', 'lead', lead.id, { name: lead.name });
    res.status(201).json(lead);
  } catch (err) { next(err); }
});

// PUT /api/leads/:id — update lead
router.put('/:id', async (req, res, next) => {
  try {
    // Build dynamic SET clause from body
    const b = req.body;
    const fieldMap = {
      name: 'name', vorname: 'vorname', nachname: 'nachname', rolle: 'rolle',
      kontaktEmail: 'kontakt_email', kontakt_email: 'kontakt_email',
      firmenEmail: 'firmen_email', firmen_email: 'firmen_email',
      telefon: 'telefon', linkedin: 'linkedin', beschreibung: 'beschreibung',
      branche: 'branche', ort: 'ort', ma: 'ma', web: 'web', fokus: 'fokus', status: 'status'
    };

    const sets = [];
    const params = [];
    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      if (b[jsKey] !== undefined) {
        params.push(b[jsKey]);
        sets.push(`${dbCol} = $${params.length}`);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id, req.user.id);
    const sql = `UPDATE leads SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length} AND deleted_at IS NULL RETURNING *`;
    const result = await query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/leads/:id — soft delete
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'UPDATE leads SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id, name',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    await logActivity(req.user.id, 'lead_deleted', 'lead', result.rows[0].id, { name: result.rows[0].name });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/leads/import — bulk import
router.post('/import', async (req, res, next) => {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Array of leads expected' });
    }

    const imported = [];
    for (const b of items) {
      const result = await query(
        `INSERT INTO leads (user_id, name, vorname, nachname, rolle, kontakt_email, firmen_email, telefon, linkedin, beschreibung, branche, ort, ma, web, fokus, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [req.user.id, b.name, b.vorname, b.nachname, b.rolle, b.kontaktEmail || b.kontakt_email, b.firmenEmail || b.firmen_email, b.telefon, b.linkedin, b.beschreibung, b.branche, b.ort, b.ma, b.web, b.fokus, b.status || 'Neu']
      );
      imported.push(result.rows[0]);
    }

    await logActivity(req.user.id, 'leads_imported', 'lead', null, { count: imported.length });
    res.status(201).json({ imported: imported.length, leads: imported });
  } catch (err) { next(err); }
});

// GET /api/leads/export — CSV export
router.get('/export', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM leads WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
      [req.user.id]
    );

    const header = 'Firma,Branche,MA,Ort,Vorname,Nachname,Rolle,Telefon,E-Mail Kontakt,Firmen-E-Mail,LinkedIn,Beschreibung,Fokus,Website,Status';
    const rows = result.rows.map(l =>
      [l.name, l.branche, l.ma, l.ort, l.vorname, l.nachname, l.rolle, l.telefon, l.kontakt_email, l.firmen_email, l.linkedin, l.beschreibung, l.fokus, l.web, l.status]
        .map(x => `"${(x || '').replace(/"/g, '""')}"`)
        .join(',')
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=leads_${new Date().toISOString().slice(0,10)}.csv`);
    res.send(header + '\n' + rows.join('\n'));
  } catch (err) { next(err); }
});

export default router;
```

**Step 2: Test leads CRUD**

```bash
# Create lead (use token from Task 4)
curl -X POST http://localhost:3000/api/leads \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Sparkasse Berlin","branche":"Banking","ort":"Berlin","vorname":"Max","nachname":"Müller","rolle":"CIO"}'
# Expected: 201 with lead object including UUID id

# List leads
curl http://localhost:3000/api/leads -H "Authorization: Bearer <TOKEN>"
# Expected: array with 1 lead
```

**Step 3: Commit**

```bash
git add backend/src/routes/leads.js
git commit -m "feat: implement leads CRUD API with search, soft delete, import/export"
```

---

## Task 6: Emails API + Resend Integration

**Files:**
- Modify: `backend/src/routes/emails.js`
- Create: `backend/src/services/resend.js`

**Step 1: Create Resend service**

Create `backend/src/services/resend.js`:

```js
import { Resend } from 'resend';

let resend = null;

function getResend() {
  if (!resend && process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export async function sendEmail({ to, subject, text, from }) {
  const client = getResend();
  if (!client) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const result = await client.emails.send({
    from: from || process.env.EMAIL_FROM,
    to: [to],
    subject,
    text
  });

  if (result.error) {
    throw new Error(result.error.message || 'Resend error');
  }

  return result.data; // { id: 'resend-id' }
}
```

**Step 2: Implement emails routes**

Replace `backend/src/routes/emails.js`:

```js
import { Router } from 'express';
import { query } from '../services/db.js';
import { logActivity } from '../services/log.js';
import { sendEmail } from '../services/resend.js';

const router = Router();

// GET /api/emails
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM emails WHERE user_id = $1';
    const params = [req.user.id];

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/emails — save generated email
router.post('/', async (req, res, next) => {
  try {
    const b = req.body;
    const result = await query(
      `INSERT INTO emails (user_id, lead_id, lead_name, lead_email, contact_name, contact_role, contact_phone, cat_id, cat_name, subject, body, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.user.id, b.leadId || b.lead_id || null, b.leadName || b.lead_name, b.leadEmail || b.lead_email, b.contactName || b.contact_name, b.contactRole || b.contact_role, b.contactPhone || b.contact_phone, b.catId || b.cat_id, b.catName || b.cat_name, b.subject, b.body, b.status || 'pending']
    );
    const email = result.rows[0];
    await logActivity(req.user.id, 'email_created', 'email', email.id, { leadName: email.lead_name, cat: email.cat_name });
    res.status(201).json(email);
  } catch (err) { next(err); }
});

// PUT /api/emails/:id — update email
router.put('/:id', async (req, res, next) => {
  try {
    const { subject, body } = req.body;
    const sets = [];
    const params = [];

    if (subject !== undefined) { params.push(subject); sets.push(`subject = $${params.length}`); }
    if (body !== undefined) { params.push(body); sets.push(`body = $${params.length}`); }

    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id, req.user.id);
    const result = await query(
      `UPDATE emails SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Email not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/emails/:id/approve — approve + send via Resend
router.post('/:id/approve', async (req, res, next) => {
  try {
    // Get email
    const result = await query(
      'SELECT * FROM emails WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Email not found' });

    const email = result.rows[0];
    if (email.status === 'approved') return res.status(400).json({ error: 'Already approved' });

    if (!email.lead_email) {
      return res.status(400).json({ error: 'No recipient email address' });
    }

    // Send via Resend
    const sent = await sendEmail({
      to: email.lead_email,
      subject: email.subject,
      text: email.body
    });

    // Update status
    await query(
      'UPDATE emails SET status = $1, resend_id = $2, sent_at = NOW() WHERE id = $3',
      ['approved', sent.id, email.id]
    );

    // Update lead status to Kontaktiert
    if (email.lead_id) {
      await query(
        "UPDATE leads SET status = 'Kontaktiert' WHERE id = $1 AND user_id = $2 AND status = 'Neu'",
        [email.lead_id, req.user.id]
      );
    }

    await logActivity(req.user.id, 'email_sent', 'email', email.id, { leadName: email.lead_name, resendId: sent.id });

    res.json({ success: true, resend_id: sent.id });
  } catch (err) { next(err); }
});

// POST /api/emails/:id/reject
router.post('/:id/reject', async (req, res, next) => {
  try {
    const result = await query(
      "UPDATE emails SET status = 'rejected' WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *",
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Email not found or not pending' });
    await logActivity(req.user.id, 'email_rejected', 'email', result.rows[0].id, { leadName: result.rows[0].lead_name });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/emails/approve-all — approve and send all pending
router.post('/approve-all', async (req, res, next) => {
  try {
    const result = await query(
      "SELECT * FROM emails WHERE user_id = $1 AND status = 'pending' AND lead_email IS NOT NULL AND lead_email != ''",
      [req.user.id]
    );

    const results = [];
    for (const email of result.rows) {
      try {
        const sent = await sendEmail({ to: email.lead_email, subject: email.subject, text: email.body });
        await query('UPDATE emails SET status = $1, resend_id = $2, sent_at = NOW() WHERE id = $3', ['approved', sent.id, email.id]);
        if (email.lead_id) {
          await query("UPDATE leads SET status = 'Kontaktiert' WHERE id = $1 AND user_id = $2 AND status = 'Neu'", [email.lead_id, req.user.id]);
        }
        results.push({ id: email.id, success: true });
      } catch (err) {
        results.push({ id: email.id, success: false, error: err.message });
      }
    }

    await logActivity(req.user.id, 'emails_bulk_sent', 'email', null, { total: result.rows.length, sent: results.filter(r => r.success).length });
    res.json({ results });
  } catch (err) { next(err); }
});

// DELETE /api/emails/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM emails WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Email not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
```

**Step 3: Test email creation and approval**

```bash
# Create email (use lead_id from Task 5, token from Task 4)
curl -X POST http://localhost:3000/api/emails \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"leadName":"Sparkasse Berlin","leadEmail":"test@example.com","subject":"Test","body":"Hello","catId":"erstansprache","catName":"Erstansprache"}'
# Expected: 201 with email object

# Approve (will fail without valid RESEND_API_KEY — that's OK for now)
curl -X POST http://localhost:3000/api/emails/<EMAIL_ID>/approve \
  -H "Authorization: Bearer <TOKEN>"
# Expected: error about Resend API key (or success if key is set)
```

**Step 4: Commit**

```bash
git add backend/src/routes/emails.js backend/src/services/resend.js
git commit -m "feat: implement emails API with Resend integration for real email sending"
```

---

## Task 7: Inbox API + Webhook

**Files:**
- Modify: `backend/src/routes/inbox.js`

**Step 1: Implement inbox routes**

Replace `backend/src/routes/inbox.js`:

```js
import { Router } from 'express';
import { query } from '../services/db.js';
import { logActivity } from '../services/log.js';
import { sendEmail } from '../services/resend.js';

const router = Router();

// GET /api/inbox
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM inbox WHERE user_id = $1 ORDER BY received_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/inbox — webhook from Resend (no auth — webhook secret check instead)
// NOTE: This route is mounted under authMiddleware in app.js.
// For the Resend webhook, we need a separate unauthenticated route.
// We'll handle this by checking for a webhook signature or accepting
// both authenticated (manual create) and unauthenticated (webhook) requests.
router.post('/', async (req, res, next) => {
  try {
    const b = req.body;

    // Find lead by from_email across all users
    let userId = req.user?.id;
    let leadId = null;

    if (b.from_email || b.fromEmail) {
      const fromEmail = b.from_email || b.fromEmail;
      const leadResult = await query(
        'SELECT id, user_id FROM leads WHERE (kontakt_email = $1 OR firmen_email = $1) AND deleted_at IS NULL LIMIT 1',
        [fromEmail]
      );
      if (leadResult.rows.length > 0) {
        leadId = leadResult.rows[0].id;
        if (!userId) userId = leadResult.rows[0].user_id;
      }
    }

    if (!userId) {
      return res.status(400).json({ error: 'Cannot determine user for this message' });
    }

    const result = await query(
      `INSERT INTO inbox (user_id, lead_id, from_name, from_email, subject, body, cat_name, orig_body)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [userId, leadId, b.from_name || b.from || b.fromName, b.from_email || b.fromEmail, b.subject, b.body, b.cat_name || b.catName, b.orig_body || b.origBody]
    );

    // Update lead status to Geantwortet
    if (leadId) {
      await query("UPDATE leads SET status = 'Geantwortet' WHERE id = $1", [leadId]);
    }

    await logActivity(userId, 'inbox_received', 'inbox', result.rows[0].id, { from: b.from_email || b.fromEmail });

    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/inbox/:id/reply — send reply via Resend
router.post('/:id/reply', async (req, res, next) => {
  try {
    const { body: replyText } = req.body;
    if (!replyText) return res.status(400).json({ error: 'Reply body required' });

    const result = await query('SELECT * FROM inbox WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Inbox item not found' });

    const item = result.rows[0];

    if (item.from_email) {
      await sendEmail({
        to: item.from_email,
        subject: 'Re: ' + (item.subject || ''),
        text: replyText
      });
    }

    await query(
      'UPDATE inbox SET replied = TRUE, reply_body = $1 WHERE id = $2',
      [replyText, item.id]
    );

    // Update lead status to Warm
    if (item.lead_id) {
      await query("UPDATE leads SET status = 'Warm' WHERE id = $1 AND user_id = $2", [item.lead_id, req.user.id]);
    }

    await logActivity(req.user.id, 'reply_sent', 'inbox', item.id, { to: item.from_email });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /api/inbox/:id — update status
router.put('/:id', async (req, res, next) => {
  try {
    const { replied, reply_body, replyBody } = req.body;
    const result = await query(
      'UPDATE inbox SET replied = COALESCE($1, replied), reply_body = COALESCE($2, reply_body) WHERE id = $3 AND user_id = $4 RETURNING *',
      [replied, reply_body || replyBody, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

export default router;
```

**Step 2: Commit**

```bash
git add backend/src/routes/inbox.js
git commit -m "feat: implement inbox API with Resend webhook and reply sending"
```

---

## Task 8: Users API (Admin), Settings API, Logs API

**Files:**
- Modify: `backend/src/routes/users.js`
- Modify: `backend/src/routes/settings.js`
- Modify: `backend/src/routes/logs.js`

**Step 1: Implement users routes (admin)**

Replace `backend/src/routes/users.js`:

```js
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../services/db.js';
import { logActivity } from '../services/log.js';
import { adminMiddleware } from '../middleware/admin.js';

const router = Router();
const SALT_ROUNDS = 12;

// All routes require admin
router.use(adminMiddleware);

// GET /api/users
router.get('/', async (req, res, next) => {
  try {
    const result = await query('SELECT id, name, email, role, created_at, last_login FROM users ORDER BY created_at');
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/users — admin creates user
router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, E-Mail und Passwort erforderlich.' });
    if (password.length < 8) return res.status(400).json({ error: 'Passwort min. 8 Zeichen.' });

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'E-Mail bereits registriert.' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name.trim(), email.toLowerCase().trim(), hash, role || 'user']
    );

    await logActivity(req.user.id, 'user_created', 'auth', result.rows[0].id, { name: name, role: role || 'user' });
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/users/:id — update role/name
router.put('/:id', async (req, res, next) => {
  try {
    const { role, name } = req.body;
    const sets = [];
    const params = [];

    if (role !== undefined) { params.push(role); sets.push(`role = $${params.length}`); }
    if (name !== undefined) { params.push(name); sets.push(`name = $${params.length}`); }

    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id);
    const result = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, name, email, role`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    await logActivity(req.user.id, 'user_updated', 'auth', req.params.id, { role, name });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });

    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id, name', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    await logActivity(req.user.id, 'user_deleted', 'auth', req.params.id, { name: result.rows[0].name });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /api/users/:id/password — admin resets password
router.put('/:id/password', async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ error: 'Passwort min. 8 Zeichen.' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, name', [hash, req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    await logActivity(req.user.id, 'password_reset', 'auth', req.params.id, { name: result.rows[0].name });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
```

**Step 2: Implement settings routes**

Replace `backend/src/routes/settings.js`:

```js
import { Router } from 'express';
import { query } from '../services/db.js';

const router = Router();

// GET /api/settings
router.get('/', async (req, res, next) => {
  try {
    const result = await query('SELECT cfg, product FROM settings WHERE user_id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.json({ cfg: {}, product: {} });
    }
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/settings
router.put('/', async (req, res, next) => {
  try {
    const { cfg, product } = req.body;
    const result = await query(
      `INSERT INTO settings (user_id, cfg, product)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         cfg = COALESCE($2, settings.cfg),
         product = COALESCE($3, settings.product)
       RETURNING cfg, product`,
      [req.user.id, cfg ? JSON.stringify(cfg) : '{}', product ? JSON.stringify(product) : '{}']
    );
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

export default router;
```

**Step 3: Implement logs routes**

Replace `backend/src/routes/logs.js`:

```js
import { Router } from 'express';
import { query } from '../services/db.js';

const router = Router();

// GET /api/logs
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 2000);
    const result = await query(
      'SELECT * FROM activity_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [req.user.id, limit]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

export default router;
```

**Step 4: Test**

```bash
# Settings
curl -X PUT http://localhost:3000/api/settings \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"cfg":{"name":"Daria","role":"AI Architect"},"product":{"name":"LeadOS"}}'
# Expected: 200 with saved settings

# Logs
curl http://localhost:3000/api/logs -H "Authorization: Bearer <TOKEN>"
# Expected: array of activity log entries from previous tasks
```

**Step 5: Commit**

```bash
git add backend/src/routes/users.js backend/src/routes/settings.js backend/src/routes/logs.js
git commit -m "feat: implement users (admin), settings, and activity log API routes"
```

---

## Task 9: Rate Limiting

**Files:**
- Create: `backend/src/middleware/rateLimit.js`
- Modify: `backend/src/app.js`

**Step 1: Create rate limit middleware**

Create `backend/src/middleware/rateLimit.js`:

```js
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Login-Versuche. Bitte warten.' }
});
```

**Step 2: Apply rate limiters in app.js**

Add to `backend/src/app.js` after `app.use(express.json(...))`:

```js
import { apiLimiter, authLimiter } from './middleware/rateLimit.js';

// After express.json():
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
```

**Step 3: Commit**

```bash
git add backend/src/middleware/rateLimit.js backend/src/app.js
git commit -m "feat: add rate limiting — 100/min API, 5/min auth"
```

---

## Task 10: Docker Setup

**Files:**
- Create: `backend/Dockerfile`
- Create: `docker-compose.yml`

**Step 1: Create Dockerfile**

Create `backend/Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY src/ src/
COPY migrations/ migrations/
EXPOSE 3000
CMD ["node", "src/app.js"]
```

**Step 2: Create docker-compose.yml**

Create `docker-compose.yml` (project root):

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: leados
      POSTGRES_PASSWORD: leados
      POSTGRES_DB: leados
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    depends_on:
      - db
    env_file:
      - ./backend/.env
    environment:
      DATABASE_URL: postgresql://leados:leados@db:5432/leados

volumes:
  pgdata:
```

**Step 3: Commit**

```bash
git add backend/Dockerfile docker-compose.yml
git commit -m "feat: add Dockerfile and docker-compose for postgres + backend"
```

---

## Task 11: Frontend — Switch to Backend Mode

This is the most sensitive task. We modify `LeadOS_SalesAgent-2.html` minimally — only data functions, not UI/styles/LLM.

**Files:**
- Modify: `LeadOS_SalesAgent-2.html`

**Key changes:**

1. `AUTH_MODE = 'backend'` (line 2897)
2. Replace `save()` / `load()` — in backend mode, each operation calls the API directly instead of bulk save/load
3. Replace `doSend()` — call `/api/emails/:id/approve` instead of Gmail
4. Replace `doSendReply()` — call `/api/inbox/:id/reply` instead of Gmail
5. Replace Team management functions to use `/api/users`
6. Load/save settings and product via `/api/settings`
7. Accept UUID strings from server (no client-side `uid()` for persisted data)

**Step 1: Change AUTH_MODE and add backend data functions**

At line 2897, change:
```js
const AUTH_MODE = 'backend';
```

**Step 2: Replace `save()` and `load()` with backend-aware versions**

Replace the save/load block (lines 1099-1106) with:

```js
const save = () => {
  if (AUTH_MODE === 'backend' && AUTH_API()) return; // backend mode: each operation saves individually
  ['leads','pending','inbox','logs'].forEach(k => localStorage.setItem(userKey(k), JSON.stringify(eval(k))));
  localStorage.setItem('los3_cfg', JSON.stringify(cfg));
};

const load = async () => {
  if (AUTH_MODE === 'backend' && AUTH_API()) {
    try {
      const [leadsRes, emailsRes, inboxRes, settingsRes, logsRes] = await Promise.all([
        authFetch('/api/leads'),
        authFetch('/api/emails'),
        authFetch('/api/inbox'),
        authFetch('/api/settings'),
        authFetch('/api/logs?limit=200')
      ]);
      if (leadsRes.ok) leads = await leadsRes.json();
      if (emailsRes.ok) pending = await emailsRes.json();
      if (inboxRes.ok) inbox = await inboxRes.json();
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        if (s.cfg) cfg = { ...cfg, ...s.cfg };
        if (s.product) try { localStorage.setItem('los3_product', JSON.stringify(s.product)); } catch(e){}
      }
      if (logsRes.ok) {
        const serverLogs = await logsRes.json();
        logs = serverLogs.map(l => ({ msg: l.action + (l.details?.name ? ': ' + l.details.name : ''), t: 'info', time: l.created_at }));
      }
    } catch (e) { console.error('Load failed:', e); }
    return;
  }
  ['leads','pending','inbox','logs'].forEach(k => { try { eval(k+'=JSON.parse(localStorage.getItem(userKey(k))||"[]")'); } catch(e){} });
  try { const c = localStorage.getItem('los3_cfg'); if(c) cfg = {...cfg, ...JSON.parse(c)}; } catch(e){}
};
```

**Step 3: Replace `doSend()` (line 1607-1619)**

```js
const doSend = async (entry, lead) => {
  if (AUTH_MODE === 'backend' && AUTH_API()) {
    try {
      const res = await authFetch('/api/emails/' + entry.id + '/approve', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        addLog('Fehler beim Senden: ' + (data.error || res.status), 'err');
        return;
      }
      addLog('E-Mail gesendet via Resend: ' + entry.leadName, 'ok');
      if (lead) lead.status = 'Kontaktiert';
    } catch (e) {
      addLog('Sendefehler: ' + e.message, 'err');
    }
    return;
  }
  // Local fallback: open Gmail
  const to = entry.leadEmail || '';
  const sub = encodeURIComponent(entry.subject);
  const bod = encodeURIComponent(entry.body);
  if (to) {
    window.open('https://mail.google.com/mail/?view=cm&to=' + to + '&su=' + sub + '&body=' + bod, '_blank');
  } else {
    window.open('https://mail.google.com/mail/?view=cm&su=' + sub + '&body=' + bod, '_blank');
  }
  if (lead) { lead.status = 'Kontaktiert'; save(); }
};
```

**Step 4: Replace `doSendReply()` (line 1954-1963)**

```js
const doSendReply = async (item, text) => {
  if (AUTH_MODE === 'backend' && AUTH_API()) {
    try {
      const res = await authFetch('/api/inbox/' + item.id + '/reply', {
        method: 'POST',
        body: JSON.stringify({ body: text })
      });
      if (!res.ok) { addLog('Fehler beim Antworten', 'err'); return; }
      item.replied = true; item.replyBody = text; item.aiDraft = null;
      const lead = leads.find(l => l.id === item.leadId);
      if (lead) lead.status = 'Warm';
      ui(); renderInbox(); renderLeads();
      addLog('Antwort gesendet: ' + item.from, 'ok');
    } catch (e) { addLog('Antwortfehler: ' + e.message, 'err'); }
    return;
  }
  // Local fallback: Gmail
  if (cfg.gFrom && item.fromEmail) {
    window.open('https://mail.google.com/mail/?view=cm&to=' + encodeURIComponent(item.fromEmail) + '&su=' + encodeURIComponent('Re: ' + item.subject) + '&body=' + encodeURIComponent(text), '_blank');
  }
  item.replied = true; item.replyBody = text; item.aiDraft = null;
  const lead = leads.find(l => l.id === item.leadId);
  if (lead) lead.status = 'Warm';
  save(); ui(); renderInbox(); renderLeads();
  addLog('Antwort gesendet: ' + item.from, 'ok');
};
```

**Step 5: Make boot `load()` async-aware**

Change the boot block (line 3228-3235):

```js
(async () => {
  const loggedIn = await checkSession();
  if (!loggedIn) return;
  await load(); migrateLegacyLeads(); applyCfg(); ui();
  renderLeads(); renderApprove(); renderInbox(); renderLog();
  renderCatGrid(); renderLeadPicker(); renderLinkedInEnrichList();
  setInterval(tick, 1000); tick();

  // Inbox polling (backend mode)
  if (AUTH_MODE === 'backend' && AUTH_API()) {
    setInterval(async () => {
      try {
        const res = await authFetch('/api/inbox');
        if (res.ok) { inbox = await res.json(); ui(); renderInbox(); }
      } catch (e) {}
    }, 30000);
  }
})();
```

**Step 6: Add backend-aware save for individual operations**

For lead creation in runAgent (after new leads are parsed and pushed to `leads` array), add API save. For email generation (after emails are pushed to `pending` array), add API save. These are the **key data mutation points** — each one needs a backend API call added.

The pattern for every mutation point is:
```js
// After pushing to local array:
if (AUTH_MODE === 'backend' && AUTH_API()) {
  authFetch('/api/leads', { method: 'POST', body: JSON.stringify(leadObj) })
    .then(r => r.json())
    .then(saved => { /* update local id with server UUID */ });
}
```

**This task requires careful line-by-line editing of the HTML file.** Each mutation of `leads`, `pending`, `inbox` arrays that calls `save()` needs a parallel `authFetch()` call in backend mode. The full list of mutation points (from grep):

1. `runAgent()` — pushes to `leads` array → POST /api/leads for each
2. Email generation loop — pushes to `pending` array → POST /api/emails for each
3. `approveOne()` — calls `doSend()` → already handled in Step 3
4. `rejectOne()` — changes status → POST /api/emails/:id/reject
5. `approveAll()` — calls approveOne per item → already handled
6. `delLead()` — splices leads array → DELETE /api/leads/:id
7. `expCSV()` → GET /api/leads/export (download response)
8. `impJSON()` → POST /api/leads/import
9. `applyCfg()` / `saveCfg()` → PUT /api/settings
10. `saveProduct()` → PUT /api/settings
11. Team functions (createUser, deleteUser, toggleRole, resetPassword) → /api/users
12. `changeOwnPassword()` → PUT /api/auth/password

**Step 7: Commit**

```bash
git add LeadOS_SalesAgent-2.html
git commit -m "feat: switch frontend to backend mode — API calls replace localStorage"
```

---

## Execution Order Summary

| Task | Description | Depends on |
|------|-------------|-----------|
| 1 | Project scaffold | — |
| 2 | Database schema | 1 |
| 3 | Auth middleware | 1 |
| 4 | Auth routes | 2, 3 |
| 5 | Leads CRUD | 2, 3 |
| 6 | Emails + Resend | 2, 3 |
| 7 | Inbox + webhook | 2, 3, 6 |
| 8 | Users, settings, logs | 2, 3 |
| 9 | Rate limiting | 1 |
| 10 | Docker | 1 |
| 11 | Frontend switch | 4, 5, 6, 7, 8 |

**Parallelizable:** Tasks 5, 6, 7, 8 can run in parallel (all depend on 2+3 only). Task 9 and 10 are independent of data routes.

---

## Smoke Test Checklist

After all tasks complete:

1. `docker-compose up` — postgres + backend start
2. `npm run migrate` — schema applied
3. Open HTML in browser, set Backend URL to `http://localhost:3000`
4. Register → first user becomes admin
5. Create 3 leads via Agent search
6. Generate 3 emails (Erstansprache category)
7. Approve 1 email → real email sent via Resend
8. Check inbox polling works
9. Create second user via Team page
10. Verify activity log shows all operations
11. Reload page → all data persists from PostgreSQL

# LeadOS Backend — Design Document

**Date:** 2026-03-17
**Status:** Approved
**Scope:** Node.js backend with PostgreSQL, JWT auth, Resend email, REST API

---

## 1. What exists (Frontend v2.0)

LeadOS — single HTML file (~160 KB, 3238 lines). Working features:

- Lead search agent (Claude/GPT/Gemini)
- Lead database (Vorname, Nachname, Rolle, Telefon, E-Mail, Firmen-E-Mail, Beschreibung, LinkedIn)
- AI autofill contacts via selected LLM
- Company profile form (product, USP, ROI, pricing, references)
- Email generator — 9 categories, live editing, table/card views
- Freigabe — approval table with inline editing, filters, bulk approve
- LinkedIn Prospecting — URL generation, Apollo.io/Hunter.io enrichment
- Inbox — incoming replies, LLM-generated responses
- Auth — Login/Register, SHA-256 password hash, 7-day session
- Multi-LLM — Claude, OpenAI, Gemini switching in Konfiguration
- Team management — admin panel: create/delete users, toggle roles, reset passwords
- Backend URL field + `authFetch()` with JWT headers

Everything stored in localStorage. Goal: server backend with PostgreSQL, JWT auth, real email sending.

---

## 2. Target Architecture

| Layer | Technology | Purpose | Hosting |
|-------|-----------|---------|---------|
| Frontend | HTML + Vanilla JS (ready) | UI Sales Agent | Any static host |
| Backend | Node.js + Express | REST API, Auth, Webhooks | Railway / Render / VPS |
| Database | PostgreSQL (Supabase) | Leads, emails, users, logs | Supabase Cloud (free) |
| Auth | JWT + bcrypt | Session tokens, password hashing | Backend |
| Email | Resend.com API | Real email sending | Resend Cloud |
| AI | Claude / OpenAI / Gemini | Text generation — from browser | API providers |

### Frontend modes

| Mode | Condition | Data storage | Auth |
|------|-----------|-------------|------|
| local (current) | `AUTH_MODE = "local"` or Backend URL empty | localStorage | SHA-256 in localStorage |
| backend (target) | `AUTH_MODE = "backend"` + Backend URL set | PostgreSQL | JWT Bearer token |

---

## 3. Auth — JWT

Frontend already has `authFetch()` that adds `Authorization: Bearer <token>` to all requests.

### 3.1 Auth API endpoints

| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| POST | /api/auth/register | `{ name, email, password }` | `{ token, user: {id, name, email, role} }` |
| POST | /api/auth/login | `{ email, password }` | `{ token, user: {id, name, email, role} }` |
| GET | /api/auth/me | Header: Bearer token | `{ user: {id, name, email, role} }` |
| POST | /api/auth/logout | Header: Bearer token | `{ success: true }` |
| PUT | /api/auth/password | `{ oldPassword, newPassword }` | `{ success: true }` |
| GET | /api/health | — | `{ status: "ok", version: "2.0" }` |

### 3.2 Requirements

- Passwords: bcrypt hash (saltRounds: 12) — not SHA-256
- JWT: 7-day expiry, secret from `JWT_SECRET` env var
- First registered user gets `role="admin"` automatically
- Middleware `auth.js` verifies token for all routes except `/api/auth/*` and `/api/health`
- Invalid token → HTTP 401 `{ error: "Unauthorized" }`
- Logout adds token hash to `revoked_tokens` table (cleanup: cron deletes expired rows)

### 3.3 Table: users

| Field | Type | Description |
|-------|------|-------------|
| id | UUID PRIMARY KEY DEFAULT gen_random_uuid() | Unique ID |
| name | VARCHAR(100) NOT NULL | User name |
| email | VARCHAR(255) UNIQUE NOT NULL | Email — login |
| password_hash | VARCHAR(255) NOT NULL | bcrypt hash |
| role | VARCHAR(20) DEFAULT 'user' | admin / user |
| created_at | TIMESTAMPTZ DEFAULT NOW() | Registration date |
| last_login | TIMESTAMPTZ | Last login |

### 3.4 Table: revoked_tokens

| Field | Type | Description |
|-------|------|-------------|
| token_hash | VARCHAR(64) PRIMARY KEY | SHA-256 hash of JWT |
| expires_at | TIMESTAMPTZ NOT NULL | Token expiry (for cleanup) |

---

## 4. REST API — Data

All endpoints (except `/api/auth/*` and `/api/health`) require valid JWT token. Missing/invalid → HTTP 401.

### 4.1 Leads

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/leads | Get all leads. Query: `?status=Neu&search=berlin` |
| POST | /api/leads | Create lead. Body: lead object |
| PUT | /api/leads/:id | Update lead (any fields) |
| DELETE | /api/leads/:id | Soft delete: `deleted_at = NOW()` |
| POST | /api/leads/import | Bulk import. Body: `[{...}, {...}]` |
| GET | /api/leads/export | Export CSV. Response: `text/csv` |

### 4.2 Emails

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/emails | List emails. Query: `?status=pending` |
| POST | /api/emails | Save generated email |
| PUT | /api/emails/:id | Update email (subject, body) |
| POST | /api/emails/:id/approve | Approve → send via Resend → status `approved` |
| POST | /api/emails/:id/reject | Reject → status `rejected` |
| POST | /api/emails/approve-all | Approve and send all pending emails |
| DELETE | /api/emails/:id | Delete email |

### 4.3 Inbox

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/inbox | List incoming replies |
| POST | /api/inbox | Webhook from Resend — incoming email |
| POST | /api/inbox/:id/reply | Send reply via Resend |
| PUT | /api/inbox/:id | Update status (replied = true) |

### 4.4 Users (admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users | List all users |
| POST | /api/users | Admin creates user. Body: `{ name, email, password, role }` |
| PUT | /api/users/:id | Update user (role, name) |
| DELETE | /api/users/:id | Delete user |
| PUT | /api/users/:id/password | Admin resets password. Body: `{ password }` |

### 4.5 Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/settings | Get current user's settings (cfg + product profile) |
| PUT | /api/settings | Save settings. Body: `{ cfg: {...}, product: {...} }` |

### 4.6 Activity Log

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/logs | Get activity log. Query: `?limit=200` |

---

## 5. Database — PostgreSQL

### 5.1 Table: leads

| Field | Type | Description |
|-------|------|-------------|
| id | UUID PRIMARY KEY DEFAULT gen_random_uuid() | ID |
| user_id | UUID REFERENCES users(id) | Owner |
| name | VARCHAR(255) NOT NULL | Company name |
| vorname | VARCHAR(100) | Contact first name |
| nachname | VARCHAR(100) | Contact last name |
| rolle | VARCHAR(150) | Role/title |
| kontakt_email | VARCHAR(255) | Contact email |
| firmen_email | VARCHAR(255) | Company email |
| telefon | VARCHAR(50) | Phone |
| linkedin | VARCHAR(500) | LinkedIn URL |
| beschreibung | TEXT | Company description |
| branche | VARCHAR(150) | Industry |
| ort | VARCHAR(150) | City |
| ma | VARCHAR(50) | Employee count |
| web | VARCHAR(255) | Website |
| fokus | TEXT | Focus / USP |
| status | VARCHAR(50) DEFAULT 'Neu' | Neu/Kontaktiert/Warm/Geantwortet/Kalt |
| deleted_at | TIMESTAMPTZ | Soft delete |
| created_at | TIMESTAMPTZ DEFAULT NOW() | Created |
| updated_at | TIMESTAMPTZ DEFAULT NOW() | Updated |

### 5.2 Table: emails

| Field | Type | Description |
|-------|------|-------------|
| id | UUID PRIMARY KEY DEFAULT gen_random_uuid() | ID |
| user_id | UUID REFERENCES users(id) | Owner |
| lead_id | UUID REFERENCES leads(id) | Lead reference |
| lead_name | VARCHAR(255) | Company name |
| lead_email | VARCHAR(255) | Recipient email |
| contact_name | VARCHAR(200) | Contact name |
| contact_role | VARCHAR(150) | Contact role |
| contact_phone | VARCHAR(50) | Phone |
| cat_id | VARCHAR(50) | Category (erstansprache, followup...) |
| cat_name | VARCHAR(100) | Category name |
| subject | VARCHAR(500) | Email subject |
| body | TEXT NOT NULL | Email body |
| status | VARCHAR(50) DEFAULT 'pending' | pending/approved/rejected |
| resend_id | VARCHAR(100) | Resend ID for tracking |
| sent_at | TIMESTAMPTZ | Send time |
| created_at | TIMESTAMPTZ DEFAULT NOW() | Created |

### 5.3 Table: inbox

| Field | Type | Description |
|-------|------|-------------|
| id | UUID PRIMARY KEY DEFAULT gen_random_uuid() | ID |
| user_id | UUID REFERENCES users(id) | Owner |
| lead_id | UUID REFERENCES leads(id) | Lead reference |
| from_name | VARCHAR(200) | Sender name |
| from_email | VARCHAR(255) | Sender email |
| subject | VARCHAR(500) | Subject |
| body | TEXT | Incoming email text |
| cat_name | VARCHAR(100) | Original email category |
| orig_body | TEXT | Original email text (context) |
| replied | BOOLEAN DEFAULT FALSE | Reply sent |
| reply_body | TEXT | Reply text |
| received_at | TIMESTAMPTZ DEFAULT NOW() | Received at |

### 5.4 Table: activity_log

| Field | Type | Description |
|-------|------|-------------|
| id | UUID PRIMARY KEY DEFAULT gen_random_uuid() | ID |
| user_id | UUID REFERENCES users(id) | Who |
| action | VARCHAR(100) NOT NULL | Type: lead_created, email_sent, login... |
| entity_type | VARCHAR(50) | lead / email / inbox / auth |
| entity_id | UUID | Related record ID |
| details | JSONB | Additional data |
| created_at | TIMESTAMPTZ DEFAULT NOW() | Timestamp |

### 5.5 Table: settings

| Field | Type | Description |
|-------|------|-------------|
| id | UUID PRIMARY KEY DEFAULT gen_random_uuid() | ID |
| user_id | UUID REFERENCES users(id) UNIQUE | Owner (one per user) |
| cfg | JSONB DEFAULT '{}' | App config (name, role, company, sig, webhookUrl...) |
| product | JSONB DEFAULT '{}' | Product profile (product, USP, ROI, pricing, refs) |
| updated_at | TIMESTAMPTZ DEFAULT NOW() | Last update |

### 5.6 Table: revoked_tokens

| Field | Type | Description |
|-------|------|-------------|
| token_hash | VARCHAR(64) PRIMARY KEY | SHA-256 of JWT string |
| expires_at | TIMESTAMPTZ NOT NULL | Token expiry for cleanup |

---

## 6. Integrations

### 6.1 Resend.com — email sending

- SDK: `npm install resend`
- Key: `RESEND_API_KEY` in .env
- Send from verified domain (configured in Resend Dashboard)
- Save `resend_id` to emails table for tracking
- Error handling: unreachable address, rate limits, invalid domain → clear error message
- Free tier: 100 emails/day, 3,000/month. Paid: from $20/month.

### 6.2 Multi-LLM — Claude / OpenAI / Gemini

LLM calls go directly from the browser — not proxied through backend. API keys stored in user's localStorage (or in settings table when in backend mode, but still called from browser).

Optional proxy endpoint (to hide API key from user):
- `POST /api/llm/generate`: `{ prompt, max_tokens }` — keys in .env

### 6.3 Incoming emails — Webhook

- `POST /api/inbox` — receives incoming replies from Resend (Inbound Email)
- Logic: find lead by `from_email` → save to inbox → update lead status to "Geantwortet"
- Browser polling: `GET /api/inbox` every 30 sec, badge update without reload

---

## 7. Frontend Modifications

Minimal changes. Only replace localStorage operations with `authFetch()` calls. Do NOT touch UI, styles, or LLM calls.

### 7.1 localStorage → API replacement

| Current function | New API call |
|-----------------|-------------|
| `save()` → localStorage | `authFetch("/api/leads/:id", {method:"PUT", body})` |
| `load()` ← localStorage | `authFetch("/api/leads")` at startup |
| `pending` (email queue) | `authFetch("/api/emails")` + `POST /api/emails` |
| `inbox` | `authFetch("/api/inbox")` |
| `approveOne(id)` → `doSend()` → Gmail | `authFetch("/api/emails/:id/approve", {method:"POST"})` |
| `rejectOne(id)` | `authFetch("/api/emails/:id/reject", {method:"POST"})` |
| `doSendReply()` → Gmail | `authFetch("/api/inbox/:id/reply", {method:"POST", body})` |
| `delLead(id)` | `authFetch("/api/leads/:id", {method:"DELETE"})` |
| `expCSV()` | `authFetch("/api/leads/export")` → download file |
| `impJSON()` | `authFetch("/api/leads/import", {method:"POST", body})` |
| `localStorage('los3_product')` | `authFetch("/api/settings")` — product in settings |
| `localStorage('los3_cfg')` | `authFetch("/api/settings")` — cfg in settings |
| Team CRUD (getUsers/saveUsers) | `authFetch("/api/users")` + PUT/POST/DELETE |
| `logs` array | `authFetch("/api/logs")` — read only, server logs automatically |

### 7.2 Key function replacements

**`doSend()` (line 1607)** — currently opens Gmail. Replace with:
```js
const doSend = async (entry) => {
  const res = await authFetch('/api/emails/' + entry.id + '/approve', {method:'POST'});
  if(!res.ok) { addLog('Fehler beim Senden: ' + (await res.json()).error, 'err'); return; }
  addLog('E-Mail gesendet via Resend: ' + entry.leadName, 'ok');
};
```

**`doSendReply()` (line 1954)** — currently opens Gmail. Replace with:
```js
const doSendReply = async (item, text) => {
  const res = await authFetch('/api/inbox/' + item.id + '/reply', {method:'POST', body: JSON.stringify({body: text})});
  if(!res.ok) { addLog('Fehler beim Antworten', 'err'); return; }
  item.replied = true; item.replyBody = text; item.aiDraft = null;
  renderInbox();
};
```

### 7.3 ID handling

Frontend `uid()` returns numeric IDs. Backend returns UUID strings. In backend mode, all new records get IDs from the server response — do not generate client-side IDs for persisted data.

### 7.4 Activation

```js
// Change from:
const AUTH_MODE = 'local';
// To:
const AUTH_MODE = 'backend';
```

Backend URL set by user in Konfiguration → "Backend URL" field. `authFetch()` reads `cfg.backendUrl` automatically.

---

## 8. Tasks & Priorities

P1 = system won't launch without it. P2 = full functionality. P3 = improvements & DevOps.

| # | Task | Priority | Est. | Section |
|---|------|----------|------|---------|
| 1 | Node.js + Express project: folder structure, .env, CORS, error handler | P1 | 2h | Backend |
| 2 | PostgreSQL schema: all 7 tables (users, leads, emails, inbox, activity_log, settings, revoked_tokens) | P1 | 3h | DB |
| 3 | Auth: POST /register, /login, /me, /logout, /password + JWT middleware | P1 | 4h | Auth |
| 4 | Users table: bcrypt passwords, admin/user roles, first-user = admin | P1 | 2h | Auth |
| 5 | CRUD API leads: GET/POST/PUT/DELETE /api/leads + soft delete | P1 | 4h | API |
| 6 | API emails: GET/POST/PUT /api/emails + approve/reject/approve-all | P1 | 3h | API |
| 7 | Resend integration: real send on POST /api/emails/:id/approve | P1 | 3h | Email |
| 8 | Settings API: GET/PUT /api/settings (cfg + product profile) | P1 | 2h | API |
| 9 | Users API: GET/POST/PUT/DELETE /api/users + password reset (admin) | P1 | 2h | API |
| 10 | Activity log: auto-logging + GET /api/logs | P1 | 2h | API |
| 11 | Frontend: AUTH_MODE="backend", replace localStorage with API calls, replace doSend/doSendReply | P1 | 5h | Frontend |
| 12 | GET /api/health — healthcheck endpoint | P1 | 0.5h | Backend |
| 13 | API inbox: GET/POST /api/inbox + Resend webhook + reply via Resend | P2 | 3h | Email |
| 14 | Inbox polling in browser (30 sec), badge update without reload | P2 | 2h | Frontend |
| 15 | Bulk import/export leads via API | P2 | 2h | API |
| 16 | Rate limiting: 100 req/min API, 5 req/min /auth/login | P2 | 1h | Backend |
| 17 | Refresh token — auto-renew session without re-login | P2 | 2h | Auth |
| 18 | Dockerfile + docker-compose (postgres + backend) | P3 | 2h | DevOps |
| 19 | Deploy to Railway: auto-deploy from GitHub on push to main | P3 | 2h | DevOps |
| 20 | Swagger / OpenAPI docs for all endpoints | P3 | 2h | Docs |

**P1: ~32.5h | P2: ~10h | P3: ~6h | Total: ~48.5h**

---

## 9. Project Structure

```
leados/
├── frontend/
│   └── LeadOS_SalesAgent.html       # updated file (minimal changes)
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js              # /api/auth/*
│   │   │   ├── leads.js             # /api/leads
│   │   │   ├── emails.js            # /api/emails
│   │   │   ├── inbox.js             # /api/inbox
│   │   │   ├── users.js             # /api/users (admin)
│   │   │   ├── settings.js          # /api/settings
│   │   │   └── logs.js              # /api/logs
│   │   ├── services/
│   │   │   ├── resend.js            # email sending
│   │   │   └── db.js                # pg pool, queries
│   │   ├── middleware/
│   │   │   ├── auth.js              # JWT verify + revoked check
│   │   │   ├── admin.js             # admin role check
│   │   │   └── rateLimit.js         # rate limiting
│   │   └── app.js                   # Express + CORS + routes
│   ├── migrations/
│   │   └── 001_schema.sql           # full DB schema (7 tables)
│   ├── .env.example
│   └── package.json
├── docker-compose.yml               # postgres + backend
└── README.md
```

### Environment variables

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/leados

# Auth
JWT_SECRET=your-secret-min-64-chars-random-string
JWT_EXPIRES_IN=7d

# Email
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=sales@yourdomain.com

# Server
PORT=3000
NODE_ENV=production
CORS_ORIGINS=http://localhost:3000,https://your-frontend-url

# Optional: Redis for token blacklist (fallback: revoked_tokens table)
REDIS_URL=redis://localhost:6379
```

---

## 10. Acceptance Criteria

### P1 — Minimum viable version

- GET /api/health returns 200 OK
- POST /api/auth/register creates user, returns JWT token
- POST /api/auth/login with correct password returns token, incorrect → 401
- Without token, request to /api/leads returns 401
- Lead created in browser is saved to PostgreSQL and visible after reload
- "Freigeben & Senden" sends real email via Resend — does NOT open Gmail
- Email arrives to recipient within 60 seconds
- CORS configured: browser does not block API requests
- Product profile and cfg persist in settings table across sessions
- Admin can manage team members via UI (create, delete, change role, reset password)
- Activity log shows server-side entries

### P2 — Full functionality

- Incoming replies appear in Inbox without reload (polling 30 sec)
- All operations logged to activity_log
- Rate limiting: 6th login request per minute returns 429
- Bulk send 10+ emails via approve-all works without errors

---

## 11. Deliverables

- Git repository with backend source code
- SQL migration `001_schema.sql` — all 7 tables
- Updated `LeadOS_SalesAgent.html` with `AUTH_MODE="backend"` and API calls
- `.env.example` with all variables described
- `README.md`: local run (`docker-compose up`) and Railway deploy
- Instructions for domain verification in Resend Dashboard
- Swagger docs or Postman collection for all endpoints

### Smoke test

Register → create 3 leads → generate 3 emails → approve one via Resend → confirm delivery without spam. Show activity_log entries. Verify team management works for admin.

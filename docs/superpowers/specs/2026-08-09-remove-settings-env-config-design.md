# Remove Settings page — move config to `.env`

## Goal

LeadOS currently stores API keys and product/persona config per-user in a `settings`
DB table, editable through a Settings page in the frontend, with `.env` values used
only as fallback defaults. This is more flexibility than the product needs — LeadOS is
run by a single team with one shared set of keys and one sender identity.

This change:

- Moves all API keys and persona/sender config to backend `.env` (single shared
  config, no per-user override, no UI for editing them).
- Removes the Settings page and all related frontend/backend code.
- Collapses LLM provider selection to one fixed provider/model.
- Moves CRM webhook firing from client-side to server-side.

Explicitly out of scope: restructuring the single-file frontend into modules or
adding a build step, visual/UX redesign of other pages, per-user API keys or persona
overrides, and the pre-existing unused `SERPER_API_KEY` reference.

## Config model

All secrets and deployment-wide config live in `backend/.env`. Updated
`backend/.env.example`:

```
# Existing (unchanged)
DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN
RESEND_API_KEY, EMAIL_FROM
APOLLO_API_KEY
PORT, NODE_ENV, CORS_ORIGINS

# Fixing pre-existing gap (used in code, missing from .env.example)
HUNTER_API_KEY=
PERPLEXITY_API_KEY=

# LLM — collapsed to one fixed provider
LLM_PROVIDER=claude          # claude | openai | gemini
LLM_MODEL=claude-sonnet-4-20250514
CLAUDE_API_KEY=              # only the one matching LLM_PROVIDER is required
OPENAI_API_KEY=
GEMINI_API_KEY=

# Persona (used to build email-generation prompts)
SENDER_NAME=Daria
SENDER_ROLE=Lead AI Architect
SENDER_COMPANY=
EMAIL_SIGNATURE=Beste Grüße

# Sender identity (used to match inbox replies) + CRM webhook
SENDER_EMAIL=
SENDER_DISPLAY_NAME=
CRM_WEBHOOK_URL=
```

`SERPER_API_KEY` stays in `.env.example` untouched — it has no route using it (dead
reference from an old feature), predates this change, and isn't part of its scope.

## Backend changes

- Delete `backend/src/routes/settings.js` and its mount in `app.js`.
- Simplify `backend/src/services/apiKeys.js`: drop the DB lookup and `userId` param
  entirely — becomes a thin reader over `process.env`. Used by `apollo.js`,
  `emails.js`, `inbox.js`, `llm.js`.
- `llm.js`: drop the `provider`/`model` request parameters and branching, and remove
  the `/api/llm/test` connectivity-check endpoint. One code path using
  `LLM_PROVIDER` / `LLM_MODEL` / the matching key from `.env`.
- New endpoint `GET /api/config` (auth-protected): returns the non-secret runtime
  values the frontend needs — `senderName`, `senderRole`, `senderCompany`,
  `signature`, `senderEmail`, `senderDisplayName`. No API keys, no webhook URL —
  those stay server-only.
- Webhook move: currently the frontend POSTs to the CRM webhook URL directly after
  creating a lead (`sendWH`, fired from the agent flow after `POST /api/leads`).
  Move this into the backend's `POST /api/leads` handler — after insert, if
  `CRM_WEBHOOK_URL` is set, fire it server-side with the lead data. Same behavior,
  triggered server-side, no longer dependent on the browser staying open.
- `swagger.js`: remove the `Settings` tag, schema, and paths.

## Frontend changes

- Remove the Settings page/tab entirely: the config panel (API keys, provider
  dropdown, model field, Gmail sender fields, Webhook/CRM section, persona fields,
  Backend URL field) and its nav entry.
- Remove dead logic: `cfg` fields for
  `claudeKey/openaiKey/geminiKey/apolloKey/hunterKey/perplexityKey/resendKey/provider/model/gFrom/gName/whUrl/backendUrl`,
  the `PUT /api/settings` persistence calls, the per-key "test connection" handlers
  (`testClaude`/`testOpenAI`/`testGemini`/`testApollo`/`testHunter`/`testPerplexity`/`testWebhook`),
  the `pill-*` status indicators tied to them, and `sendWH`.
- Backend URL: hardcode the Railway URL as a constant (`AUTH_API`), replacing the
  `cfg.backendUrl` field and its localStorage persistence.
- Persona/sender fields: on app load, fetch `GET /api/config` once and populate the
  same `cfg.name/role/co/sig` (etc.) fields the existing prompt-building code already
  reads (around lines ~2164 and ~2642 in `frontend/index.html`) — those functions stay
  unchanged; only the source of the values changes from user-editable settings to a
  read-only server fetch.
- Language toggle (DE/EN) stays, but becomes a standalone header control backed by
  `localStorage` only, decoupled from the removed settings/`cfg`-persistence
  machinery.

## Database migration

New migration `004_drop_settings.sql`:

```sql
DROP TABLE IF EXISTS settings;
```

This permanently deletes any existing per-user settings rows (API keys people may
have entered, custom persona text) from the production database. Confirmed
intentional — nothing in that table is meant to survive since everything moves to
shared `.env` values set directly by the operator.

## Addendum: leftover panels found during planning

Reading the full Settings page HTML (not just the settings API route) surfaced two
more sections bundled into `pg-config` that weren't part of the original design
discussion:

- A **"Daten" panel** (JSON export/import, "delete my data") for the local-only
  `leads/pending/inbox/logs` arrays — a leftover from a local-only mode that predates
  the hardcoded backend URL decision above.
- A **legacy "Nutzer-Verwaltung" mini-panel** (`users-list`/`p-admin`, read-only user
  list with delete) that duplicates the full **Team & Benutzer** page (`pg-team`),
  which already has add-user, a table, role management, and password reset.

Decision: delete both along with the rest of the Settings page. The Leads page
(`pg-leads`) has its own JSON export/import buttons calling the same `expJSON`/
`impJSON` functions, so those functions are kept — only the duplicate buttons and the
Settings-page-only `nukeAll` function/button are removed.

## Testing & verification

No existing automated test suite in this repo — verification is manual smoke-testing:

- Backend: verify `POST /api/leads` fires the CRM webhook when `CRM_WEBHOOK_URL` is
  set (and skips silently when unset); verify `/api/llm`, `/api/apollo/*`,
  `/api/emails/*`, `/api/inbox` all resolve keys correctly from `.env` with no
  `userId` param.
- Frontend: walk through each remaining page (Leads, LinkedIn, Email Gen, Agent,
  Approval, Log, Team) to confirm nothing references removed `cfg` fields or dead
  functions, and that persona values render correctly in generated emails.

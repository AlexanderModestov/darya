# Simplify LinkedIn Prospecting Tab

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the complex 5-panel LinkedIn Prospecting tab with a clean vertical flow: search config → company list with inline contact results.

**Architecture:** Single-file edit of `frontend/index.html` — replace HTML (lines 761-894) and JS functions (lines 3309-3636). Keep all backend endpoints unchanged.

**Tech Stack:** Vanilla HTML/JS/CSS (existing SPA pattern)

---

### Task 1: Replace HTML — new simplified layout

**Files:**
- Modify: `frontend/index.html:761-894` (HTML block `pg-linkedin`)

**New layout (top → bottom):**

1. **Header** — title + subtitle + "Alle anreichern" button
2. **Search config bar** — single horizontal row: jobtitle input + region select + "Kontakte suchen" button (remove: keywords, mode)
3. **Company list** — each company card shows:
   - Company name, branche, ort, domain
   - Inline contact results (name, email, phone, linkedin) when found
   - Per-company actions: "Suchen" button + manual LinkedIn URL input
   - Checkbox for bulk selection

**Remove entirely:**
- "How it works" banner
- API Status panel (② Daten-Anreicherung)
- Statistics panel
- Generated LinkedIn Searches panel (③)
- Full manual import form (⑤ Manueller LinkedIn-Import — 8 fields)

**Keep:**
- Alert div for messages
- Badge counter on nav (`b-li`)

### Task 2: Rewrite `renderLinkedInEnrichList()` → `renderCompanyList()`

**Files:**
- Modify: `frontend/index.html:3313-3367` (JS function)

**New behavior:**
- Render all leads as company cards in vertical list
- Each card: company info + found contacts inline + action buttons
- Group: "Needs contacts" on top, "Complete" below (collapsed)
- Each card has small inline input for manual LinkedIn URL + save button
- Checkbox per card for bulk "enrich selected"

### Task 3: Simplify `runLinkedInSearch()` → search contacts for selected/all companies

**Files:**
- Modify: `frontend/index.html:3403-3492`

**Changes:**
- Remove LinkedIn URL generation logic (no more opening LinkedIn tabs)
- Just run Apollo people search per selected company
- Show results inline in company cards
- Remove `openAllLinkedIn()`, `openLinkedInSearch()`, `buildLinkedInURL()`, `buildLinkedInCompanyURL()`

### Task 4: Update i18n keys

**Files:**
- Modify: `frontend/index.html` (DE + EN translation objects)

**Changes:**
- Remove unused keys (linkedin_step1-3, linkedin_mode_*, linkedin_keywords, etc.)
- Add new keys for simplified UI

### Task 5: Cleanup dead references

- Remove `li-st-found`, `li-st-email`, `li-st-phone`, `li-st-saved` references from JS
- Keep `b-li` badge counter working
- Remove `liProfiles` variable (unused)

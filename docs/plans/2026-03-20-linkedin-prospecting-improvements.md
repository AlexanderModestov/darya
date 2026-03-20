# LinkedIn Prospecting Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Apollo enrichment (broken authFetch call), use real domains from `web` field, use user-entered Jobtitel, return all matching people (per_page=5) as separate leads, validate LinkedIn URLs before saving.

**Architecture:** All changes are in `frontend/index.html`. The `apolloSearch()` function is rewritten to accept the lead's `web` domain and user Jobtitel, return an array of people, and validate LinkedIn URLs. `enrichOneLead()` is updated to handle multiple results — first person updates the existing lead, additional people create new leads via `apiSave('POST')`.

**Tech Stack:** Vanilla JS frontend, Apollo.io REST API via backend proxy (`/api/apollo/search`)

---

### Task 1: Add `isValidLinkedIn()` and `extractDomain()` utility functions

**Files:**
- Modify: `frontend/index.html:3255` (insert before `buildLinkedInURL`)

**Step 1: Add the two utility functions**

Insert before line 3255 (`// Build LinkedIn People Search URL`):

```js
// ── LinkedIn URL validation ─────────────────────────────────────────────────
const isValidLinkedIn = (url) =>
  typeof url === 'string' && /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9._%-]+/.test(url.trim());

// ── Extract domain from web field ───────────────────────────────────────────
const extractDomain = (web) => {
  if (!web) return null;
  try {
    let u = web.trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    const h = new URL(u).hostname.replace(/^www\./, '');
    return h || null;
  } catch { return null; }
};
```

**Step 2: Verify no syntax errors**

Open browser console, reload page. No errors expected.

**Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat: add isValidLinkedIn and extractDomain utilities"
```

---

### Task 2: Rewrite `apolloSearch()` — fix authFetch bug, real domain, user Jobtitel, multiple results

**Files:**
- Modify: `frontend/index.html:3439-3462` (replace entire `apolloSearch` function)

**Step 1: Replace `apolloSearch` function**

Replace lines 3439–3462 with:

```js
// Apollo.io People Search API (via backend proxy)
const apolloSearch = async (lead) => {
  const jobtitel = V('li-jobtitle');
  const titles = jobtitel
    ? jobtitel.split(',').map(s => s.trim()).filter(Boolean)
    : ['CIO','IT-Leiter','CTO','CEO','Geschäftsführer','Compliance','Head of IT'];

  // Use real domain from web field, fallback to generated domain
  const realDomain = extractDomain(lead.web);
  const fallbackDomain = lead.name
    ? lead.name.toLowerCase().replace(/gmbh|ag|kg|ug|se|inc|llc/gi,'').trim().replace(/\s+/g,'') + '.de'
    : undefined;
  const domain = realDomain || fallbackDomain;

  const res = await authFetch('/api/apollo/search', {
    method: 'POST',
    body: JSON.stringify({
      q_organization_domains: domain ? [domain] : undefined,
      q_keywords: lead.name || '',
      person_titles: titles,
      page: 1,
      per_page: 5
    })
  });
  if (!res.ok) throw new Error('Apollo HTTP ' + res.status);
  const data = await res.json();
  const people = data.people || [];
  if (!people.length) return [];

  return people.map(person => ({
    kontakt: [person.first_name, person.last_name].filter(Boolean).join(' ') + (person.title ? ', ' + person.title : ''),
    vorname: person.first_name || '',
    nachname: person.last_name || '',
    rolle: person.title || '',
    email: person.email || '',
    telefon: person.phone_numbers?.[0]?.sanitized_number || person.organization?.phone || '',
    linkedin: isValidLinkedIn(person.linkedin_url) ? person.linkedin_url : '',
    apolloData: person
  }));
};
```

Key changes:
- **Bug fix:** `authFetch` now receives proper `{ method, body }` object instead of `('POST', {...})`
- **Real domain:** Uses `extractDomain(lead.web)` with fallback
- **User Jobtitel:** Reads from `li-jobtitle` input, splits by comma
- **Multiple results:** `per_page: 5`, returns array of people
- **LinkedIn validation:** Only stores URL if `isValidLinkedIn()` passes

**Step 2: Verify no syntax errors**

Open browser console, reload page. No errors expected.

**Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat: rewrite apolloSearch — fix authFetch bug, real domain, user jobtitel, multi-results"
```

---

### Task 3: Rewrite `enrichOneLead()` — handle multiple Apollo results, create new leads

**Files:**
- Modify: `frontend/index.html:3375-3412` (replace entire `enrichOneLead` function)

**Step 1: Replace `enrichOneLead` function**

Replace lines 3375–3412 with:

```js
// ── APOLLO.IO ENRICHMENT ────────────────────────────────────────────────────
const enrichOneLead = async (id) => {
  const lead = leads.find(l => l.id === id);
  if (!lead) return;

  const btn = $('liq-' + id)?.querySelector('.btn-purple');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="sp"></span>'; }

  let enriched = false;

  if (cfg.apolloKey) {
    try {
      const results = await apolloSearch(lead);
      if (results.length > 0) {
        // First result updates the existing lead
        const first = results[0];
        if (first.email && !lead.kontaktEmail) { lead.kontaktEmail = first.email; lead.email = first.email; }
        if (first.telefon && !lead.telefon) lead.telefon = first.telefon;
        if (first.linkedin && !lead.linkedin) lead.linkedin = first.linkedin;
        if (first.apolloData) lead.apolloData = first.apolloData;
        if (first.vorname && !lead.vorname) lead.vorname = first.vorname;
        if (first.nachname && !lead.nachname) lead.nachname = first.nachname;
        if (first.rolle && !lead.rolle) lead.rolle = first.rolle;
        if (first.kontakt) lead.kontakt = first.kontakt;
        enriched = true;
        addLog('Apollo: ' + lead.name + ' → ' + (first.email || '') + ' · ' + (first.telefon || ''), 'ok');
        await apiSave('/api/leads/' + lead.id, 'PUT', lead);

        // Additional results → create new leads under same company
        for (let i = 1; i < results.length; i++) {
          const p = results[i];
          if (!p.email && !p.linkedin) continue; // skip empty results

          // Deduplicate by linkedin URL or email
          const isDuplicate = leads.some(l =>
            (p.linkedin && l.linkedin === p.linkedin) ||
            (p.email && (l.kontaktEmail === p.email || l.email === p.email))
          );
          if (isDuplicate) continue;

          const newLead = {
            id: uid(), name: lead.name,
            vorname: p.vorname, nachname: p.nachname, rolle: p.rolle,
            kontakt: p.kontakt, kontaktEmail: p.email, email: p.email,
            firmenEmail: '', telefon: p.telefon, linkedin: p.linkedin,
            branche: lead.branche, ort: lead.ort, ma: lead.ma,
            web: lead.web, fokus: lead.fokus,
            status: 'Neu', apolloData: p.apolloData,
            created: new Date().toLocaleDateString(loc())
          };
          const savedLead = await apiSave('/api/leads', 'POST', newLead);
          if (savedLead) newLead.id = savedLead.id;
          leads.unshift(newLead);
          addLog('Apollo+: ' + lead.name + ' → ' + p.kontakt + ' · ' + (p.email || ''), 'ok');
        }
      }
    } catch (e) { addLog('Apollo-Fehler: ' + e.message, 'err'); }
  }

  save(); renderLinkedInEnrichList(); renderLeads(); renderLeadPicker();
  if (btn) { btn.disabled = false; btn.textContent = enriched ? '✓' : '⚡'; }
};
```

Key changes:
- Calls `apolloSearch(lead)` passing full lead object (for `web` domain access)
- First result updates existing lead
- Results 2–5 create new leads with same company name, branche, ort, etc.
- Deduplication by `linkedin` URL or `email` — skips if already in `leads` array
- Each new lead saved to backend via `apiSave('POST')`

**Step 2: Verify no syntax errors**

Open browser console, reload page. No errors expected.

**Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat: enrichOneLead handles multiple Apollo results, creates new leads"
```

---

### Task 4: Add LinkedIn validation to manual capture (`saveManualCapture`)

**Files:**
- Modify: `frontend/index.html:3500` (the linkedin assignment in saveManualCapture)

**Step 1: Add validation to manual capture**

Replace line 3500:
```js
    if(V('mc-linkedin')) lead.linkedin = V('mc-linkedin');
```

With:
```js
    if(V('mc-linkedin') && isValidLinkedIn(V('mc-linkedin'))) lead.linkedin = V('mc-linkedin');
```

Also replace line 3518:
```js
      kontakt, linkedin: V('mc-linkedin'),
```

With:
```js
      kontakt, linkedin: isValidLinkedIn(V('mc-linkedin')) ? V('mc-linkedin') : '',
```

**Step 2: Verify no syntax errors**

Reload page, test manual capture form with invalid URL — should not save linkedin field.

**Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat: validate LinkedIn URLs in manual capture before saving"
```

---

### Task 5: Final integration test

**Step 1: Test full flow**

1. Open LinkedIn Prospecting page
2. Enter Jobtitel (e.g. "CIO, IT-Leiter") and Region
3. Click "Suche starten" — verify search URLs generated
4. Select a lead with a known `web` field → click enrich
5. Verify: Apollo called with real domain, multiple contacts saved as separate leads
6. Verify: only valid LinkedIn URLs saved in `linkedin` field
7. Test manual capture with invalid LinkedIn URL → field should be empty

**Step 2: Final commit**

```bash
git add frontend/index.html
git commit -m "feat: linkedin prospecting — all improvements complete"
```

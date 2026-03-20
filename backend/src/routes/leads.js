import { Router } from 'express';
import { query } from '../services/db.js';
import { logActivity } from '../services/log.js';

const router = Router();

// Field mapping: camelCase frontend → snake_case DB
const FIELD_MAP = {
  name: 'name',
  vorname: 'vorname',
  nachname: 'nachname',
  rolle: 'rolle',
  kontaktEmail: 'kontakt_email',
  kontakt_email: 'kontakt_email',
  firmenEmail: 'firmen_email',
  firmen_email: 'firmen_email',
  telefon: 'telefon',
  linkedin: 'linkedin',
  beschreibung: 'beschreibung',
  branche: 'branche',
  ort: 'ort',
  ma: 'ma',
  web: 'web',
  fokus: 'fokus',
  status: 'status',
  apolloData: 'apollo_data',
  apollo_data: 'apollo_data',
};

/**
 * Map incoming body keys (camelCase or snake_case) to DB column names.
 * Returns an object with only recognised fields.
 */
function mapFields(body) {
  const mapped = {};
  for (const [key, value] of Object.entries(body)) {
    const col = FIELD_MAP[key];
    if (col !== undefined) {
      mapped[col] = value;
    }
  }
  return mapped;
}

// ─── CSV Export (must be before /:id) ────────────────────────────────────────

router.get('/export', async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await query(
      `SELECT name, branche, ma, ort, vorname, nachname, rolle, telefon,
              kontakt_email, firmen_email, linkedin, beschreibung, fokus, web, status, apollo_data
       FROM leads
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [userId]
    );

    const header = 'Firma,Branche,MA,Ort,Vorname,Nachname,Rolle,Telefon,E-Mail Kontakt,Firmen-E-Mail,LinkedIn,Beschreibung,Fokus,Website,Status';
    const csvRows = rows.map((r) => {
      const vals = [
        r.name, r.branche, r.ma, r.ort, r.vorname, r.nachname, r.rolle,
        r.telefon, r.kontakt_email, r.firmen_email, r.linkedin,
        r.beschreibung, r.fokus, r.web, r.status,
      ];
      return vals.map(escapeCSV).join(',');
    });

    const csv = [header, ...csvRows].join('\n');
    const today = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=leads_${today}.csv`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ─── Bulk Import (must be before /:id) ───────────────────────────────────────

router.post('/import', async (req, res) => {
  try {
    const userId = req.user.id;
    const items = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Body must be a non-empty array of leads' });
    }

    const leads = [];
    for (const item of items) {
      const lead = await insertLead(userId, item);
      leads.push(lead);
    }

    await logActivity(userId, 'leads_imported', 'lead', null, { count: leads.length });

    res.status(201).json({ imported: leads.length, leads });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Import failed' });
  }
});

// ─── List Leads ──────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, search } = req.query;

    const conditions = ['user_id = $1', 'deleted_at IS NULL'];
    const params = [userId];
    let idx = 2;

    if (status) {
      conditions.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }

    if (search) {
      const like = `%${search}%`;
      conditions.push(
        `(name ILIKE $${idx} OR ort ILIKE $${idx} OR branche ILIKE $${idx} OR vorname ILIKE $${idx} OR nachname ILIKE $${idx})`
      );
      params.push(like);
      idx++;
    }

    const sql = `SELECT * FROM leads WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('List leads error:', err);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// ─── Create Lead ─────────────────────────────────────────────────────────────

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

// ─── Update Lead ─────────────────────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const fields = mapFields(req.body);

    const keys = Object.keys(fields);
    if (keys.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided' });
    }

    const setClauses = keys.map((col, i) => `${col} = $${i + 1}`);
    const params = keys.map((col) => fields[col]);

    const nextIdx = params.length + 1;
    const sql = `UPDATE leads SET ${setClauses.join(', ')}, updated_at = NOW()
                 WHERE id = $${nextIdx} AND user_id = $${nextIdx + 1} AND deleted_at IS NULL
                 RETURNING *`;
    params.push(id, userId);

    const { rows } = await query(sql, params);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Update lead error:', err);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// ─── Soft Delete Lead ────────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { rows } = await query(
      `UPDATE leads SET deleted_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Delete associated emails and inbox entries
    await query('DELETE FROM emails WHERE lead_id = $1', [id]);
    await query('DELETE FROM inbox WHERE lead_id = $1', [id]);

    await logActivity(userId, 'lead_deleted', 'lead', id, null);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete lead error:', err);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function insertLead(userId, body) {
  const fields = mapFields(body);
  if (!fields.status) {
    fields.status = 'Neu';
  }

  const cols = Object.keys(fields);
  const vals = cols.map((c) => fields[c]);
  const placeholders = cols.map((_, i) => `$${i + 2}`); // $1 is user_id

  const sql = `INSERT INTO leads (user_id, ${cols.join(', ')})
               VALUES ($1, ${placeholders.join(', ')})
               RETURNING *`;

  const { rows } = await query(sql, [userId, ...vals]);
  return rows[0];
}

function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default router;

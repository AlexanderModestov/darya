import { Router } from 'express';
import { query } from '../services/db.js';
import { logActivity } from '../services/log.js';
import { sendEmail } from '../services/resend.js';

const router = Router();

// GET /api/inbox — List incoming replies for current user
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM inbox WHERE user_id = $1 ORDER BY received_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/inbox — Create inbox entry (webhook from Resend or manual)
router.post('/', async (req, res, next) => {
  try {
    const fromName   = req.body.from_name   ?? req.body.fromName   ?? null;
    const fromEmail  = req.body.from_email  ?? req.body.fromEmail  ?? null;
    const subject    = req.body.subject     ?? null;
    const body       = req.body.body        ?? null;
    const catName    = req.body.cat_name    ?? req.body.catName    ?? null;
    const origBody   = req.body.orig_body   ?? req.body.origBody   ?? null;

    // Try to find lead by from_email
    let lead = null;
    if (fromEmail) {
      const { rows } = await query(
        'SELECT id, user_id FROM leads WHERE (kontakt_email = $1 OR firmen_email = $1) AND deleted_at IS NULL LIMIT 1',
        [fromEmail]
      );
      if (rows.length > 0) {
        lead = rows[0];
      }
    }

    const userId = lead ? lead.user_id : req.user.id;
    const leadId = lead ? lead.id : null;

    const { rows } = await query(
      `INSERT INTO inbox (user_id, lead_id, from_name, from_email, subject, body, cat_name, orig_body)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, leadId, fromName, fromEmail, subject, body, catName, origBody]
    );

    // Update lead status to 'Geantwortet' if lead found
    if (lead) {
      await query(
        "UPDATE leads SET status = 'Geantwortet', updated_at = NOW() WHERE id = $1",
        [lead.id]
      );
    }

    await logActivity(userId, 'inbox_received', 'inbox', rows[0].id, {
      from_email: fromEmail,
      subject,
      lead_id: leadId,
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/inbox/:id/reply — Send reply via Resend
router.post('/:id/reply', async (req, res, next) => {
  try {
    const { body: replyBody } = req.body;

    if (!replyBody) {
      return res.status(400).json({ error: 'body is required' });
    }

    // Get inbox item by id + user_id
    const { rows } = await query(
      'SELECT * FROM inbox WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Inbox item not found' });
    }

    const item = rows[0];

    // Send reply via Resend
    await sendEmail({
      to: item.from_email,
      subject: 'Re: ' + (item.subject || ''),
      text: replyBody,
    });

    // Update inbox entry
    await query(
      'UPDATE inbox SET replied = TRUE, reply_body = $1 WHERE id = $2',
      [replyBody, item.id]
    );

    // Update lead status to 'Warm' if lead exists
    if (item.lead_id) {
      await query(
        "UPDATE leads SET status = 'Warm', updated_at = NOW() WHERE id = $1",
        [item.lead_id]
      );
    }

    await logActivity(req.user.id, 'inbox_replied', 'inbox', item.id, {
      to: item.from_email,
      lead_id: item.lead_id,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/inbox/:id — Update status
router.put('/:id', async (req, res, next) => {
  try {
    const replied   = req.body.replied   ?? null;
    const replyBody = req.body.reply_body ?? req.body.replyBody ?? null;

    const { rows } = await query(
      `UPDATE inbox
       SET replied    = COALESCE($1, replied),
           reply_body = COALESCE($2, reply_body)
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [replied, replyBody, req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Inbox item not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;

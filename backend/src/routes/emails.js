import { Router } from 'express';
import { query } from '../services/db.js';
import { logActivity } from '../services/log.js';
import { sendEmail } from '../services/resend.js';

const router = Router();

// GET /api/emails — List emails for user
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    let sql = 'SELECT * FROM emails WHERE user_id = $1';
    const params = [userId];

    if (status) {
      sql += ' AND status = $2';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const { rows } = await query(sql, params);
    return res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/emails — Save generated email
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const b = req.body;

    const leadId = b.leadId || b.lead_id || null;
    const leadName = b.leadName || b.lead_name || null;
    const leadEmail = b.leadEmail || b.lead_email || null;
    const contactName = b.contactName || b.contact_name || null;
    const contactRole = b.contactRole || b.contact_role || null;
    const contactPhone = b.contactPhone || b.contact_phone || null;
    const catId = b.catId || b.cat_id || null;
    const catName = b.catName || b.cat_name || null;
    const { subject, body } = b;

    if (!body) {
      return res.status(400).json({ error: 'body is required' });
    }

    const { rows } = await query(
      `INSERT INTO emails (user_id, lead_id, lead_name, lead_email, contact_name, contact_role, contact_phone, cat_id, cat_name, subject, body)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [userId, leadId, leadName, leadEmail, contactName, contactRole, contactPhone, catId, catName, subject, body]
    );

    await logActivity(userId, 'email_created', 'email', rows[0].id, { lead_id: leadId, subject });

    return res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/emails/approve-all — Approve and send all pending emails (MUST be before /:id routes)
router.post('/approve-all', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { rows: pending } = await query(
      "SELECT * FROM emails WHERE user_id = $1 AND status = 'pending' AND lead_email IS NOT NULL AND lead_email != ''",
      [userId]
    );

    const results = [];

    for (const email of pending) {
      try {
        const data = await sendEmail({
          to: email.lead_email,
          subject: email.subject,
          text: email.body
        });

        await query(
          "UPDATE emails SET status = 'approved', resend_id = $1, sent_at = NOW() WHERE id = $2",
          [data.id, email.id]
        );

        // Update lead status from 'Neu' to 'Kontaktiert'
        if (email.lead_id) {
          await query(
            "UPDATE leads SET status = 'Kontaktiert' WHERE id = $1 AND user_id = $2 AND status = 'Neu'",
            [email.lead_id, userId]
          );
        }

        await logActivity(userId, 'email_approved', 'email', email.id, { resend_id: data.id });

        results.push({ id: email.id, success: true });
      } catch (err) {
        results.push({ id: email.id, success: false, error: err.message });
      }
    }

    return res.json({ results });
  } catch (err) {
    next(err);
  }
});

// PUT /api/emails/:id — Update subject and/or body
router.put('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { subject, body } = req.body;

    if (subject === undefined && body === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const sets = [];
    const params = [];
    let idx = 1;

    if (subject !== undefined) {
      sets.push(`subject = $${idx++}`);
      params.push(subject);
    }
    if (body !== undefined) {
      sets.push(`body = $${idx++}`);
      params.push(body);
    }

    params.push(id, userId);

    const { rows } = await query(
      `UPDATE emails SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    return res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/emails/:id/approve — Approve + send via Resend
router.post('/:id/approve', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // 1. Get email
    const { rows } = await query(
      'SELECT * FROM emails WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const email = rows[0];

    // 2. Check not already approved
    if (email.status === 'approved') {
      return res.status(400).json({ error: 'Email already approved' });
    }

    // 3. Check lead_email exists
    if (!email.lead_email) {
      return res.status(400).json({ error: 'No lead email address' });
    }

    // 4. Send via Resend
    const data = await sendEmail({
      to: email.lead_email,
      subject: email.subject,
      text: email.body
    });

    // 5. Update email status
    await query(
      "UPDATE emails SET status = 'approved', resend_id = $1, sent_at = NOW() WHERE id = $2",
      [data.id, id]
    );

    // 6. Update lead status from 'Neu' to 'Kontaktiert'
    if (email.lead_id) {
      await query(
        "UPDATE leads SET status = 'Kontaktiert' WHERE id = $1 AND user_id = $2 AND status = 'Neu'",
        [email.lead_id, userId]
      );
    }

    // 7. Log activity
    await logActivity(userId, 'email_approved', 'email', id, { resend_id: data.id });

    // 8. Return
    return res.json({ success: true, resend_id: data.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/emails/:id/reject — Reject email
router.post('/:id/reject', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { rows } = await query(
      "UPDATE emails SET status = 'rejected' WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *",
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Email not found or not pending' });
    }

    await logActivity(userId, 'email_rejected', 'email', id);

    return res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/emails/:id — Hard delete
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { rows } = await query(
      'DELETE FROM emails WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    await logActivity(userId, 'email_deleted', 'email', id);

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;

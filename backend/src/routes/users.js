import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../services/db.js';
import { logActivity } from '../services/log.js';
import { adminMiddleware } from '../middleware/admin.js';

const router = Router();

// All routes in this file require admin role
router.use(adminMiddleware);

// GET /api/users — List all users
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, email, role, created_at, last_login FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/users — Admin creates a new user
router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check email uniqueness
    const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const { rows } = await query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at, last_login',
      [name.trim(), normalizedEmail, passwordHash, role || 'user']
    );
    const user = rows[0];

    await logActivity(req.user.id, 'user_created', 'user', user.id, { name: user.name, email: user.email, role: user.role });

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id — Update user role and/or name
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, role } = req.body;

    const fields = {};
    if (name !== undefined) fields.name = name.trim();
    if (role !== undefined) fields.role = role;

    const keys = Object.keys(fields);
    if (keys.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided.' });
    }

    const setClauses = keys.map((col, i) => `${col} = $${i + 1}`);
    const params = keys.map((col) => fields[col]);

    const nextIdx = params.length + 1;
    const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${nextIdx} RETURNING id, name, email, role, created_at, last_login`;
    params.push(id);

    const { rows } = await query(sql, params);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await logActivity(req.user.id, 'user_updated', 'user', id, fields);

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id — Delete user
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself.' });
    }

    const { rows } = await query('DELETE FROM users WHERE id = $1 RETURNING id, name, email', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await logActivity(req.user.id, 'user_deleted', 'user', id, { name: rows[0].name, email: rows[0].email });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id/password — Admin resets user password
router.put('/:id/password', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const { rows } = await query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id',
      [passwordHash, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await logActivity(req.user.id, 'user_password_reset', 'user', id);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;

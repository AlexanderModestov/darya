import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../services/db.js';
import { authMiddleware, hashToken } from '../middleware/auth.js';
import { logActivity } from '../services/log.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, E-Mail und Passwort sind erforderlich.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen lang sein.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check uniqueness
    const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'E-Mail ist bereits registriert.' });
    }

    // First user becomes admin
    const { rows: countRows } = await query('SELECT COUNT(*) AS cnt FROM users');
    const role = parseInt(countRows[0].cnt, 10) === 0 ? 'admin' : 'user';

    const passwordHash = await bcrypt.hash(password, 12);

    const { rows } = await query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name.trim(), normalizedEmail, passwordHash, role]
    );
    const user = rows[0];

    const token = signToken(user);

    await logActivity(user.id, 'register', 'auth', user.id, { role });

    return res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const { rows } = await query('SELECT id, name, email, password_hash, role FROM users WHERE email = $1', [normalizedEmail]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'E-Mail oder Passwort falsch.' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'E-Mail oder Passwort falsch.' });
    }

    // Update last_login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = signToken(user);

    await logActivity(user.id, 'login', 'auth', user.id);

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    }
    return res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    const token = req.headers.authorization.slice(7);
    const tokenHash = hashToken(token);
    const decoded = jwt.decode(token);
    const expiresAt = new Date(decoded.exp * 1000);

    await query(
      'INSERT INTO revoked_tokens (token_hash, expires_at) VALUES ($1, $2)',
      [tokenHash, expiresAt]
    );

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/password
router.put('/password', authMiddleware, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Altes und neues Passwort sind erforderlich.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Neues Passwort muss mindestens 8 Zeichen lang sein.' });
    }

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    }

    const valid = await bcrypt.compare(oldPassword, rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Altes Passwort ist falsch.' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;

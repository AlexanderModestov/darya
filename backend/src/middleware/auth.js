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

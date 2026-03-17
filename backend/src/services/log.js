import { query } from './db.js';

export async function logActivity(userId, action, entityType = null, entityId = null, details = null) {
  try {
    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [userId, action, entityType, entityId, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
}

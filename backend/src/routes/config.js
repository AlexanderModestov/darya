import { Router } from 'express';
import { getApiKey } from '../services/apiKeys.js';

const router = Router();

// GET /api/config — non-secret runtime config for the frontend
router.get('/', (_req, res) => {
  res.json({
    senderName: process.env.SENDER_NAME || '',
    senderRole: process.env.SENDER_ROLE || '',
    senderCompany: process.env.SENDER_COMPANY || '',
    signature: process.env.EMAIL_SIGNATURE || '',
    senderEmail: process.env.SENDER_EMAIL || '',
    senderDisplayName: process.env.SENDER_DISPLAY_NAME || '',
    hasApolloKey: !!getApiKey('apolloKey'),
    hasPerplexityKey: !!getApiKey('perplexityKey'),
  });
});

export default router;

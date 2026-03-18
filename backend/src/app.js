import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './swagger.js';

import authRoutes from './routes/auth.js';
import leadsRoutes from './routes/leads.js';
import emailsRoutes from './routes/emails.js';
import inboxRoutes from './routes/inbox.js';
import usersRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import logsRoutes from './routes/logs.js';
import llmRoutes from './routes/llm.js';
import { authMiddleware } from './middleware/auth.js';
import { apiLimiter, authLimiter } from './middleware/rateLimit.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('change-me')) {
  console.error('FATAL: Set a secure JWT_SECRET in .env');
  process.exit(1);
}

const app = express();

const origins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: origins.length > 0 ? origins : true,
  credentials: true
}));

app.use(express.json({ limit: '5mb' }));

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0' });
});

app.use('/api/auth', authRoutes);

app.use('/api/leads', authMiddleware, leadsRoutes);
app.use('/api/emails', authMiddleware, emailsRoutes);
app.use('/api/inbox', authMiddleware, inboxRoutes);
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);
app.use('/api/logs', authMiddleware, logsRoutes);
app.use('/api/llm', authMiddleware, llmRoutes);

app.use((err, _req, res, _next) => {
  console.error(err.stack || err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LeadOS API running on port ${PORT}`));

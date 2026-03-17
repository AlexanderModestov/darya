const spec = {
  openapi: '3.0.3',
  info: {
    title: 'LeadOS API',
    version: '2.0.0',
    description: 'REST API for LeadOS Sales Agent — lead management, email campaigns, inbox and user administration.',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local development' },
  ],
  tags: [
    { name: 'Health', description: 'Server status' },
    { name: 'Auth', description: 'Registration, login, session management' },
    { name: 'Leads', description: 'Lead CRUD, import/export' },
    { name: 'Emails', description: 'Email generation, approval, sending' },
    { name: 'Inbox', description: 'Incoming replies & responses' },
    { name: 'Users', description: 'User management (admin only)' },
    { name: 'Settings', description: 'User configuration & company profile' },
    { name: 'Logs', description: 'Activity log' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
      User: {
        type: 'object',
        properties: {
          id:    { type: 'string', format: 'uuid' },
          name:  { type: 'string' },
          email: { type: 'string', format: 'email' },
          role:  { type: 'string', enum: ['admin', 'user'] },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          user:  { $ref: '#/components/schemas/User' },
        },
      },
      Lead: {
        type: 'object',
        properties: {
          id:          { type: 'string', format: 'uuid' },
          user_id:     { type: 'string', format: 'uuid' },
          name:        { type: 'string', description: 'Company name' },
          vorname:     { type: 'string' },
          nachname:    { type: 'string' },
          rolle:       { type: 'string' },
          kontaktEmail:{ type: 'string', format: 'email' },
          firmenEmail: { type: 'string', format: 'email' },
          telefon:     { type: 'string' },
          linkedin:    { type: 'string' },
          beschreibung:{ type: 'string' },
          branche:     { type: 'string' },
          ort:         { type: 'string' },
          ma:          { type: 'string' },
          web:         { type: 'string' },
          fokus:       { type: 'string' },
          status:      { type: 'string', enum: ['Neu', 'Kontaktiert', 'Warm', 'Geantwortet', 'Kalt'] },
          created_at:  { type: 'string', format: 'date-time' },
          updated_at:  { type: 'string', format: 'date-time' },
        },
      },
      Email: {
        type: 'object',
        properties: {
          id:          { type: 'string', format: 'uuid' },
          user_id:     { type: 'string', format: 'uuid' },
          lead_id:     { type: 'string', format: 'uuid', nullable: true },
          leadName:    { type: 'string' },
          leadEmail:   { type: 'string', format: 'email' },
          contactName: { type: 'string' },
          contactRole: { type: 'string' },
          contactPhone:{ type: 'string' },
          catId:       { type: 'string' },
          catName:     { type: 'string' },
          subject:     { type: 'string' },
          body:        { type: 'string' },
          status:      { type: 'string', enum: ['pending', 'approved', 'rejected'] },
          resend_id:   { type: 'string', nullable: true },
          sent_at:     { type: 'string', format: 'date-time', nullable: true },
          created_at:  { type: 'string', format: 'date-time' },
        },
      },
      InboxEntry: {
        type: 'object',
        properties: {
          id:         { type: 'string', format: 'uuid' },
          user_id:    { type: 'string', format: 'uuid' },
          lead_id:    { type: 'string', format: 'uuid', nullable: true },
          fromName:   { type: 'string' },
          fromEmail:  { type: 'string', format: 'email' },
          subject:    { type: 'string' },
          body:       { type: 'string' },
          catName:    { type: 'string' },
          origBody:   { type: 'string' },
          replied:    { type: 'boolean' },
          replyBody:  { type: 'string', nullable: true },
          received_at:{ type: 'string', format: 'date-time' },
        },
      },
      ActivityLog: {
        type: 'object',
        properties: {
          id:          { type: 'string', format: 'uuid' },
          user_id:     { type: 'string', format: 'uuid' },
          action:      { type: 'string' },
          entity_type: { type: 'string' },
          entity_id:   { type: 'string', format: 'uuid' },
          details:     { type: 'object' },
          created_at:  { type: 'string', format: 'date-time' },
        },
      },
      Settings: {
        type: 'object',
        properties: {
          cfg:     { type: 'object', description: 'UI configuration JSON' },
          product: { type: 'object', description: 'Company profile JSON' },
        },
      },
    },
  },
  paths: {
    // ── Health ──────────────────────────────────────
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          200: { description: 'Server is running', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' }, version: { type: 'string', example: '2.0' } } } } } },
        },
      },
    },

    // ── Auth ────────────────────────────────────────
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        description: 'First registered user automatically becomes admin.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string', example: 'Max Mustermann' }, email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 } } } } } },
        responses: {
          201: { description: 'User created', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          409: { description: 'Email already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          429: { description: 'Too many requests' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          429: { description: 'Too many requests' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current user info',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } } },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout (revoke token)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Token revoked', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true } } } } } },
        },
      },
    },
    '/api/auth/password': {
      put: {
        tags: ['Auth'],
        summary: 'Change own password',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['oldPassword', 'newPassword'], properties: { oldPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } } } } } },
        responses: {
          200: { description: 'Password changed', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Wrong old password', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ── Leads ───────────────────────────────────────
    '/api/leads': {
      get: {
        tags: ['Leads'],
        summary: 'List leads',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by status' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search in name, ort, branche, vorname, nachname' },
        ],
        responses: {
          200: { description: 'Array of leads', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Lead' } } } } },
        },
      },
      post: {
        tags: ['Leads'],
        summary: 'Create a lead',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Lead' } } } },
        responses: {
          201: { description: 'Lead created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Lead' } } } },
          400: { description: 'Name is required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/leads/import': {
      post: {
        tags: ['Leads'],
        summary: 'Bulk import leads',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Lead' } } } } },
        responses: {
          201: { description: 'Imported', content: { 'application/json': { schema: { type: 'object', properties: { imported: { type: 'integer' }, leads: { type: 'array', items: { $ref: '#/components/schemas/Lead' } } } } } } },
          400: { description: 'Invalid input', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/leads/export': {
      get: {
        tags: ['Leads'],
        summary: 'Export leads as CSV',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } },
        },
      },
    },
    '/api/leads/{id}': {
      put: {
        tags: ['Leads'],
        summary: 'Update a lead',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Lead' } } } },
        responses: {
          200: { description: 'Updated lead', content: { 'application/json': { schema: { $ref: '#/components/schemas/Lead' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['Leads'],
        summary: 'Soft-delete a lead',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Deleted', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ── Emails ──────────────────────────────────────
    '/api/emails': {
      get: {
        tags: ['Emails'],
        summary: 'List emails',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] } },
        ],
        responses: {
          200: { description: 'Array of emails', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Email' } } } } },
        },
      },
      post: {
        tags: ['Emails'],
        summary: 'Save a generated email',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['body'], properties: { leadId: { type: 'string', format: 'uuid' }, leadName: { type: 'string' }, leadEmail: { type: 'string', format: 'email' }, contactName: { type: 'string' }, contactRole: { type: 'string' }, contactPhone: { type: 'string' }, catId: { type: 'string' }, catName: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } } } } } },
        responses: {
          201: { description: 'Email saved', content: { 'application/json': { schema: { $ref: '#/components/schemas/Email' } } } },
          400: { description: 'Body is required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/emails/approve-all': {
      post: {
        tags: ['Emails'],
        summary: 'Approve and send all pending emails',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Bulk result', content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, success: { type: 'boolean' }, error: { type: 'string' } } } } } } } } },
        },
      },
    },
    '/api/emails/{id}': {
      put: {
        tags: ['Emails'],
        summary: 'Update email subject/body',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { subject: { type: 'string' }, body: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Updated email', content: { 'application/json': { schema: { $ref: '#/components/schemas/Email' } } } },
          400: { description: 'At least subject or body required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['Emails'],
        summary: 'Delete an email',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Deleted', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/emails/{id}/approve': {
      post: {
        tags: ['Emails'],
        summary: 'Approve and send email via Resend',
        description: 'Sends the email through Resend API, updates status to approved, and sets lead status to Kontaktiert.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Sent', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, resend_id: { type: 'string' } } } } } },
          400: { description: 'No lead_email or already processed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/emails/{id}/reject': {
      post: {
        tags: ['Emails'],
        summary: 'Reject an email',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Rejected email', content: { 'application/json': { schema: { $ref: '#/components/schemas/Email' } } } },
          404: { description: 'Not found or not pending', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ── Inbox ───────────────────────────────────────
    '/api/inbox': {
      get: {
        tags: ['Inbox'],
        summary: 'List incoming replies',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Array of inbox entries', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/InboxEntry' } } } } },
        },
      },
      post: {
        tags: ['Inbox'],
        summary: 'Create inbox entry (Resend webhook)',
        description: 'Accepts incoming email from Resend Inbound. Auto-finds lead by from_email and updates status to Geantwortet.',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { fromName: { type: 'string' }, fromEmail: { type: 'string', format: 'email' }, subject: { type: 'string' }, body: { type: 'string' }, catName: { type: 'string' }, origBody: { type: 'string' } } } } } },
        responses: {
          201: { description: 'Entry created', content: { 'application/json': { schema: { $ref: '#/components/schemas/InboxEntry' } } } },
        },
      },
    },
    '/api/inbox/{id}': {
      put: {
        tags: ['Inbox'],
        summary: 'Update inbox entry status',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { replied: { type: 'boolean' }, replyBody: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Updated entry', content: { 'application/json': { schema: { $ref: '#/components/schemas/InboxEntry' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/inbox/{id}/reply': {
      post: {
        tags: ['Inbox'],
        summary: 'Send reply via Resend',
        description: 'Sends reply email, marks entry as replied, updates lead status to Warm.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['body'], properties: { body: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Reply sent', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
          400: { description: 'Body required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ── Users (admin) ───────────────────────────────
    '/api/users': {
      get: {
        tags: ['Users'],
        summary: 'List all users (admin)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Array of users', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } },
          403: { description: 'Admin only', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Create user (admin)',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 }, role: { type: 'string', enum: ['admin', 'user'] } } } } } },
        responses: {
          201: { description: 'User created', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          409: { description: 'Email exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/users/{id}': {
      put: {
        tags: ['Users'],
        summary: 'Update user (admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string', enum: ['admin', 'user'] } } } } } },
        responses: {
          200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['Users'],
        summary: 'Delete user (admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Deleted', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
          400: { description: 'Cannot delete self', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/users/{id}/password': {
      put: {
        tags: ['Users'],
        summary: 'Reset user password (admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['password'], properties: { password: { type: 'string', minLength: 8 } } } } } },
        responses: {
          200: { description: 'Password reset', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ── Settings ────────────────────────────────────
    '/api/settings': {
      get: {
        tags: ['Settings'],
        summary: 'Get user settings',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Settings', content: { 'application/json': { schema: { $ref: '#/components/schemas/Settings' } } } },
        },
      },
      put: {
        tags: ['Settings'],
        summary: 'Update user settings',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Settings' } } } },
        responses: {
          200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Settings' } } } },
        },
      },
    },

    // ── Logs ────────────────────────────────────────
    '/api/logs': {
      get: {
        tags: ['Logs'],
        summary: 'Get activity log',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 2000, default: 200 } },
        ],
        responses: {
          200: { description: 'Array of log entries', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ActivityLog' } } } } },
        },
      },
    },
  },
};

export default spec;

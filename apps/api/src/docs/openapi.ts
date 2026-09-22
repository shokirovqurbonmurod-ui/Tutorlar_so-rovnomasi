/**
 * OpenAPI 3 document served at /api/docs (Swagger UI) and /api/docs.json.
 * Kept hand-written and compact; every route group is documented with the
 * important parameters. Validation details live in the zod schemas.
 */
const bearer = [{ bearerAuth: [] }];
const pag = [
  { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 200 } },
  { name: 'search', in: 'query', schema: { type: 'string' } },
];
const scope = [
  { name: 'range', in: 'query', schema: { type: 'string', enum: ['7d', '30d', '90d', '12m'] } },
  { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
  { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
  { name: 'branchId', in: 'query', schema: { type: 'string' } },
];
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
const ok = { 200: { description: 'OK' } };
const json = (schema: unknown) => ({ required: true, content: { 'application/json': { schema } } });

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'TutorSurvey API',
    version: '1.0.0',
    description:
      'REST API for the TutorSurvey platform — Telegram bot + web admin panel for private schools.\n\n' +
      'Authenticate with `POST /api/auth/login`, then send `Authorization: Bearer <accessToken>`.\n' +
      'Access tokens are short-lived; use `POST /api/auth/refresh` (httpOnly cookie or body) to rotate.\n\n' +
      '**Roles:** SUPER_ADMIN, DIRECTOR, CEO, HR_ADMIN (dashboard) · TUTOR, TEACHER (Telegram).',
  },
  servers: [{ url: '/', description: 'Current host' }],
  tags: [
    { name: 'Auth' }, { name: 'Users' }, { name: 'Branches' }, { name: 'Surveys' }, { name: 'Reports' },
    { name: 'Analytics' }, { name: 'KPI' }, { name: 'Announcements' }, { name: 'Notifications' },
    { name: 'Tasks' }, { name: 'Audit' }, { name: 'Settings' }, { name: 'System' },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } },
      LoginRequest: { type: 'object', required: ['identifier', 'password'], properties: { identifier: { type: 'string', example: 'admin@tutorsurvey.uz' }, password: { type: 'string', example: 'Admin123!' } } },
      AuthResponse: { type: 'object', properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' }, expiresIn: { type: 'integer' }, user: { $ref: '#/components/schemas/User' } } },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' }, fullName: { type: 'string' }, email: { type: 'string', nullable: true }, phone: { type: 'string', nullable: true },
          telegramId: { type: 'string', nullable: true }, telegramUsername: { type: 'string', nullable: true },
          role: { type: 'object', properties: { key: { type: 'string', enum: ['SUPER_ADMIN', 'DIRECTOR', 'CEO', 'HR_ADMIN', 'TUTOR', 'TEACHER'] }, name: { type: 'string' } } },
          branch: { type: 'object', nullable: true }, department: { type: 'object', nullable: true }, position: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'BLOCKED', 'PENDING'] }, joinDate: { type: 'string', format: 'date-time' }, lastActivityAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      UserInput: {
        type: 'object', required: ['fullName', 'role'],
        properties: { fullName: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, password: { type: 'string', minLength: 8 }, role: { type: 'string' }, branchId: { type: 'string' }, departmentId: { type: 'string' }, position: { type: 'string' }, status: { type: 'string' }, telegramUsername: { type: 'string' }, telegramId: { type: 'string' } },
      },
      Question: {
        type: 'object', required: ['type', 'text'],
        properties: {
          type: { type: 'string', enum: ['TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'RATING', 'YES_NO', 'NUMBER'] },
          text: { type: 'string' }, hint: { type: 'string' }, isRequired: { type: 'boolean', default: true }, minValue: { type: 'integer' }, maxValue: { type: 'integer' },
          options: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } } } },
        },
      },
      SurveyInput: {
        type: 'object', required: ['title'],
        properties: {
          title: { type: 'string', example: "Haftalik Tutor So'rovnomasi" }, description: { type: 'string' },
          audience: { type: 'string', enum: ['ALL', 'TUTORS', 'TEACHERS', 'BRANCH', 'SELECTED'] }, branchId: { type: 'string' },
          isAnonymous: { type: 'boolean' }, allowMultiple: { type: 'boolean' }, scheduledAt: { type: 'string', format: 'date-time' }, deadline: { type: 'string', format: 'date-time' },
          questions: { type: 'array', items: { $ref: '#/components/schemas/Question' } }, targetUserIds: { type: 'array', items: { type: 'string' } },
        },
      },
      SendSurvey: { type: 'object', properties: { userIds: { type: 'array', items: { type: 'string' } }, branchId: { type: 'string' }, roles: { type: 'array', items: { type: 'string' } }, deadline: { type: 'string', format: 'date-time' } } },
      Review: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['APPROVED', 'REJECTED', 'NEEDS_REVISION'] }, note: { type: 'string' } } },
      Announcement: { type: 'object', required: ['title', 'body'], properties: { title: { type: 'string' }, body: { type: 'string' }, priority: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] }, audience: { type: 'string' }, branchId: { type: 'string' }, isPinned: { type: 'boolean' }, sendTelegram: { type: 'boolean', default: true } } },
      Broadcast: { type: 'object', required: ['title', 'body'], properties: { title: { type: 'string' }, body: { type: 'string' }, userIds: { type: 'array', items: { type: 'string' } }, roles: { type: 'array', items: { type: 'string' } }, branchId: { type: 'string' } } },
      Task: { type: 'object', required: ['title', 'assigneeId'], properties: { title: { type: 'string' }, description: { type: 'string' }, assigneeId: { type: 'string' }, dueAt: { type: 'string', format: 'date-time' } } },
      Branch: { type: 'object', required: ['name', 'code'], properties: { name: { type: 'string' }, code: { type: 'string' }, address: { type: 'string' }, phone: { type: 'string' }, city: { type: 'string' }, studentCount: { type: 'integer' }, directorId: { type: 'string' }, ceoId: { type: 'string' }, isActive: { type: 'boolean' } } },
    },
  },
  paths: {
    '/health': { get: { tags: ['System'], summary: 'Health check', responses: ok } },
    '/api/auth/login': { post: { tags: ['Auth'], summary: 'Login (dashboard roles only)', requestBody: json({ $ref: '#/components/schemas/LoginRequest' }), responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } }, 401: { description: 'Invalid credentials' } } } },
    '/api/auth/refresh': { post: { tags: ['Auth'], summary: 'Rotate refresh token', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { refreshToken: { type: 'string' } } } } } }, responses: ok } },
    '/api/auth/logout': { post: { tags: ['Auth'], summary: 'Revoke refresh token', responses: ok } },
    '/api/auth/me': { get: { tags: ['Auth'], security: bearer, summary: 'Current user + permissions', responses: ok } },
    '/api/auth/change-password': { post: { tags: ['Auth'], security: bearer, requestBody: json({ type: 'object', properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string' } } }), responses: ok } },
    '/api/auth/telegram-link-code': { post: { tags: ['Auth'], security: bearer, summary: 'Generate a 6-digit code to link Telegram (/link CODE)', responses: ok } },

    '/api/users': {
      get: { tags: ['Users'], security: bearer, parameters: [...pag, { name: 'role', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'branchId', in: 'query', schema: { type: 'string' } }, { name: 'telegram', in: 'query', schema: { type: 'string', enum: ['linked', 'unlinked'] } }], responses: ok },
      post: { tags: ['Users'], security: bearer, requestBody: json({ $ref: '#/components/schemas/UserInput' }), responses: { 201: { description: 'Created' } } },
    },
    '/api/users/roles': { get: { tags: ['Users'], security: bearer, responses: ok } },
    '/api/users/{id}': {
      get: { tags: ['Users'], security: bearer, parameters: [idParam], responses: ok },
      patch: { tags: ['Users'], security: bearer, parameters: [idParam], requestBody: json({ $ref: '#/components/schemas/UserInput' }), responses: ok },
      delete: { tags: ['Users'], security: bearer, parameters: [idParam], responses: ok },
    },
    '/api/users/{id}/unlink-telegram': { post: { tags: ['Users'], security: bearer, parameters: [idParam], responses: ok } },

    '/api/branches': { get: { tags: ['Branches'], security: bearer, responses: ok }, post: { tags: ['Branches'], security: bearer, requestBody: json({ $ref: '#/components/schemas/Branch' }), responses: { 201: { description: 'Created' } } } },
    '/api/branches/{id}': { get: { tags: ['Branches'], security: bearer, parameters: [idParam], responses: ok }, patch: { tags: ['Branches'], security: bearer, parameters: [idParam], responses: ok }, delete: { tags: ['Branches'], security: bearer, parameters: [idParam], responses: ok } },
    '/api/branches/departments/all': { get: { tags: ['Branches'], security: bearer, responses: ok } },
    '/api/branches/departments': { post: { tags: ['Branches'], security: bearer, responses: { 201: { description: 'Created' } } } },
    '/api/branches/groups/all': { get: { tags: ['Branches'], security: bearer, responses: ok } },
    '/api/branches/groups': { post: { tags: ['Branches'], security: bearer, responses: { 201: { description: 'Created' } } } },

    '/api/surveys': {
      get: { tags: ['Surveys'], security: bearer, parameters: [...pag, { name: 'status', in: 'query', schema: { type: 'string', enum: ['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] } }], responses: ok },
      post: { tags: ['Surveys'], security: bearer, requestBody: json({ $ref: '#/components/schemas/SurveyInput' }), responses: { 201: { description: 'Created' } } },
    },
    '/api/surveys/{id}': {
      get: { tags: ['Surveys'], security: bearer, parameters: [idParam], responses: ok },
      patch: { tags: ['Surveys'], security: bearer, parameters: [idParam], requestBody: json({ $ref: '#/components/schemas/SurveyInput' }), responses: ok },
      delete: { tags: ['Surveys'], security: bearer, parameters: [idParam], responses: ok },
    },
    '/api/surveys/{id}/duplicate': { post: { tags: ['Surveys'], security: bearer, parameters: [idParam], responses: { 201: { description: 'Created' } } } },
    '/api/surveys/{id}/send': { post: { tags: ['Surveys'], security: bearer, summary: 'Activate + assign + push Telegram notifications', parameters: [idParam], requestBody: json({ $ref: '#/components/schemas/SendSurvey' }), responses: ok } },
    '/api/surveys/{id}/schedule': { post: { tags: ['Surveys'], security: bearer, parameters: [idParam], requestBody: json({ type: 'object', properties: { scheduledAt: { type: 'string', format: 'date-time' }, deadline: { type: 'string', format: 'date-time' } } }), responses: ok } },
    '/api/surveys/{id}/remind': { post: { tags: ['Surveys'], security: bearer, parameters: [idParam], responses: ok } },
    '/api/surveys/{id}/status': { post: { tags: ['Surveys'], security: bearer, parameters: [idParam], requestBody: json({ type: 'object', properties: { status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] } } }), responses: ok } },
    '/api/surveys/{id}/results': { get: { tags: ['Surveys'], security: bearer, parameters: [idParam, ...scope.slice(1), { name: 'userId', in: 'query', schema: { type: 'string' } }, { name: 'role', in: 'query', schema: { type: 'string' } }], responses: ok } },
    '/api/surveys/{id}/export': { get: { tags: ['Surveys'], security: bearer, parameters: [idParam, { name: 'format', in: 'query', schema: { type: 'string', enum: ['csv', 'xlsx', 'pdf'], default: 'xlsx' } }, ...scope.slice(1)], responses: { 200: { description: 'File download' } } } },

    '/api/reports': { get: { tags: ['Reports'], security: bearer, parameters: [...pag, { name: 'type', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'authorId', in: 'query', schema: { type: 'string' } }, { name: 'branchId', in: 'query', schema: { type: 'string' } }], responses: ok } },
    '/api/reports/{id}': { get: { tags: ['Reports'], security: bearer, parameters: [idParam], responses: ok }, delete: { tags: ['Reports'], security: bearer, parameters: [idParam], responses: ok } },
    '/api/reports/{id}/review': { post: { tags: ['Reports'], security: bearer, parameters: [idParam], requestBody: json({ $ref: '#/components/schemas/Review' }), responses: ok } },

    '/api/analytics/dashboard': { get: { tags: ['Analytics'], security: bearer, summary: 'Everything the dashboard home needs in one call', parameters: scope, responses: ok } },
    '/api/analytics/overview': { get: { tags: ['Analytics'], security: bearer, parameters: scope, responses: ok } },
    '/api/analytics/completion': { get: { tags: ['Analytics'], security: bearer, parameters: scope, responses: ok } },
    '/api/analytics/activity': { get: { tags: ['Analytics'], security: bearer, parameters: scope, responses: ok } },
    '/api/analytics/branches': { get: { tags: ['Analytics'], security: bearer, parameters: scope, responses: ok } },
    '/api/analytics/rating': { get: { tags: ['Analytics'], security: bearer, parameters: scope, responses: ok } },
    '/api/analytics/reports': { get: { tags: ['Analytics'], security: bearer, parameters: scope, responses: ok } },
    '/api/analytics/performers': { get: { tags: ['Analytics'], security: bearer, parameters: [...scope, { name: 'role', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: ok } },

    '/api/kpi/metrics': { get: { tags: ['KPI'], security: bearer, responses: ok } },
    '/api/kpi/metrics/{id}': { patch: { tags: ['KPI'], security: bearer, parameters: [idParam], responses: ok } },
    '/api/kpi/leaderboard': { get: { tags: ['KPI'], security: bearer, parameters: [{ name: 'period', in: 'query', schema: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY'] } }, { name: 'ref', in: 'query', schema: { type: 'string', format: 'date-time' } }, { name: 'branchId', in: 'query', schema: { type: 'string' } }], responses: ok } },
    '/api/kpi/user/{id}': { get: { tags: ['KPI'], security: bearer, parameters: [idParam], responses: ok } },
    '/api/kpi/compute': { post: { tags: ['KPI'], security: bearer, requestBody: json({ type: 'object', properties: { period: { type: 'string' }, ref: { type: 'string', format: 'date-time' } } }), responses: ok } },

    '/api/announcements': { get: { tags: ['Announcements'], security: bearer, parameters: pag, responses: ok }, post: { tags: ['Announcements'], security: bearer, requestBody: json({ $ref: '#/components/schemas/Announcement' }), responses: { 201: { description: 'Created' } } } },
    '/api/announcements/{id}': { get: { tags: ['Announcements'], security: bearer, parameters: [idParam], responses: ok }, patch: { tags: ['Announcements'], security: bearer, parameters: [idParam], responses: ok }, delete: { tags: ['Announcements'], security: bearer, parameters: [idParam], responses: ok } },
    '/api/announcements/{id}/resend': { post: { tags: ['Announcements'], security: bearer, parameters: [idParam], responses: ok } },

    '/api/notifications': { get: { tags: ['Notifications'], security: bearer, parameters: [...pag, { name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'type', in: 'query', schema: { type: 'string' } }], responses: ok } },
    '/api/notifications/broadcast': { post: { tags: ['Notifications'], security: bearer, requestBody: json({ $ref: '#/components/schemas/Broadcast' }), responses: ok } },
    '/api/notifications/retry': { post: { tags: ['Notifications'], security: bearer, responses: ok } },

    '/api/tasks': { get: { tags: ['Tasks'], security: bearer, parameters: pag, responses: ok }, post: { tags: ['Tasks'], security: bearer, requestBody: json({ $ref: '#/components/schemas/Task' }), responses: { 201: { description: 'Created' } } } },
    '/api/tasks/{id}': { patch: { tags: ['Tasks'], security: bearer, parameters: [idParam], responses: ok }, delete: { tags: ['Tasks'], security: bearer, parameters: [idParam], responses: ok } },

    '/api/audit': { get: { tags: ['Audit'], security: bearer, parameters: [...pag, { name: 'action', in: 'query', schema: { type: 'string' } }, { name: 'userId', in: 'query', schema: { type: 'string' } }], responses: ok } },
    '/api/settings': { get: { tags: ['Settings'], security: bearer, responses: ok }, put: { tags: ['Settings'], security: bearer, requestBody: json({ type: 'object', additionalProperties: true }), responses: ok } },
    '/api/settings/bot': { get: { tags: ['Settings'], security: bearer, summary: 'Telegram bot status', responses: ok } },
    '/api/telegram/webhook': { post: { tags: ['System'], summary: 'Telegram webhook endpoint (webhook mode only)', responses: ok } },
  },
} as const;

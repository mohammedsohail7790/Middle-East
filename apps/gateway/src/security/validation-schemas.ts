/**
 * Reusable strict validation schemas (unknown fields rejected via allowOnly*).
 * Used with middleware/validation.ts validate().
 */
import type { ValidationSchema } from '../middleware/validation.js';

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'appointment_set', 'won', 'lost'] as const;
const BILLING_PLANS = ['essential', 'professional'] as const;
const BILLING_INTERVALS = ['monthly', 'annual', 'yearly'] as const;

export const leadsListQuerySchema: ValidationSchema = {
  allowOnlyQuery: ['status', 'assignedTo', 'minScore', 'search', 'limit', 'offset'],
  query: {
    status: { type: 'string', maxLength: 64 },
    assignedTo: { type: 'uuid' },
    minScore: { type: 'number', minimum: 0, maximum: 100 },
    search: { type: 'string', maxLength: 200 },
    limit: { type: 'number', minimum: 1, maximum: 500 },
    offset: { type: 'number', minimum: 0, maximum: 100_000 },
  },
};

export const leadCreateBodySchema: ValidationSchema = {
  allowOnlyBody: ['phoneNumber', 'source', 'email', 'name', 'notes', 'metadata'],
  body: {
    phoneNumber: { type: 'string', required: true, minLength: 3, maxLength: 32 },
    source: { type: 'string', required: true, minLength: 1, maxLength: 64 },
    email: { type: 'email', maxLength: 254 },
    name: { type: 'string', maxLength: 200 },
    notes: { type: 'string', maxLength: 5000 },
    metadata: { type: 'object' },
  },
};

export const leadUpdateBodySchema: ValidationSchema = {
  allowOnlyBody: ['email', 'name', 'notes', 'metadata', 'source', 'phoneNumber', 'phone'],
  body: {
    email: { type: 'email', maxLength: 254 },
    name: { type: 'string', maxLength: 200 },
    notes: { type: 'string', maxLength: 5000 },
    metadata: { type: 'object' },
    source: { type: 'string', maxLength: 64 },
    phoneNumber: { type: 'string', minLength: 3, maxLength: 32 },
    phone: { type: 'string', minLength: 3, maxLength: 32 },
  },
};

export const leadStatusBodySchema: ValidationSchema = {
  allowOnlyBody: ['status'],
  body: {
    status: { type: 'string', required: true, enum: [...LEAD_STATUSES], maxLength: 32 },
  },
};

export const leadAssignBodySchema: ValidationSchema = {
  allowOnlyBody: ['assignedTo'],
  body: {
    assignedTo: { type: 'uuid', required: true },
  },
};

export const leadActivityBodySchema: ValidationSchema = {
  allowOnlyBody: ['type', 'description', 'metadata'],
  body: {
    type: { type: 'string', required: true, minLength: 1, maxLength: 64 },
    description: { type: 'string', required: true, minLength: 1, maxLength: 5000 },
    metadata: { type: 'object' },
  },
};

export const leadIdParamSchema: ValidationSchema = {
  params: {
    leadId: { type: 'uuid', required: true },
  },
};

export const billingCheckoutBodySchema: ValidationSchema = {
  allowOnlyBody: ['plan', 'email', 'successUrl', 'cancelUrl', 'interval', 'billingInterval'],
  body: {
    plan: { type: 'string', required: true, enum: [...BILLING_PLANS], maxLength: 32 },
    email: { type: 'email', required: true, maxLength: 254 },
    successUrl: { type: 'url', maxLength: 2048 },
    cancelUrl: { type: 'url', maxLength: 2048 },
    interval: { type: 'string', enum: [...BILLING_INTERVALS] },
    billingInterval: { type: 'string', enum: [...BILLING_INTERVALS] },
  },
};

const TEAM_ROLES = ['owner', 'admin', 'agent', 'viewer', 'manager'] as const;
const TEAM_STATUSES = ['active', 'inactive'] as const;
const KNOWLEDGE_CATEGORIES = [
  'hvac',
  'plumbing',
  'electrical',
  'general',
  'medical',
  'legal',
  'real_estate',
] as const;
const KNOWLEDGE_FILE_TYPES = ['pdf', 'docx', 'txt', 'csv', 'text', 'md'] as const;
const PHONE_PARAM = { type: 'string', required: true, minLength: 3, maxLength: 32 } as const;
const UUID_PARAM = { type: 'uuid', required: true } as const;

export const smsConversationsQuerySchema: ValidationSchema = {
  allowOnlyQuery: ['limit', 'search'],
  query: {
    limit: { type: 'number', minimum: 1, maximum: 200 },
    search: { type: 'string', maxLength: 200 },
  },
};

export const smsPhoneParamSchema: ValidationSchema = {
  params: { phoneNumber: PHONE_PARAM },
};

export const smsSendBodySchema: ValidationSchema = {
  allowOnlyBody: ['to', 'message', 'from'],
  body: {
    to: { type: 'string', required: true, minLength: 3, maxLength: 32 },
    message: { type: 'string', required: true, minLength: 1, maxLength: 1600 },
    from: { type: 'string', maxLength: 32 },
  },
};

export const smsTemplateBodySchema: ValidationSchema = {
  allowOnlyBody: ['name', 'content', 'trigger'],
  body: {
    name: { type: 'string', required: true, minLength: 1, maxLength: 100 },
    content: { type: 'string', required: true, minLength: 1, maxLength: 1600 },
    trigger: { type: 'string', required: true, minLength: 1, maxLength: 64 },
  },
};

export const smsSendTemplateBodySchema: ValidationSchema = {
  allowOnlyBody: ['to', 'templateId', 'variables'],
  body: {
    to: { type: 'string', required: true, minLength: 3, maxLength: 32 },
    templateId: { type: 'uuid', required: true },
    variables: { type: 'object' },
  },
};

export const knowledgeIngestTextSchema: ValidationSchema = {
  allowOnlyBody: ['text', 'category'],
  body: {
    text: { type: 'string', required: true, minLength: 1, maxLength: 500_000 },
    category: { type: 'string', enum: [...KNOWLEDGE_CATEGORIES], maxLength: 32 },
  },
};

export const knowledgeIngestUrlSchema: ValidationSchema = {
  allowOnlyBody: ['url', 'category'],
  body: {
    url: { type: 'url', required: true, maxLength: 2048 },
    category: { type: 'string', enum: [...KNOWLEDGE_CATEGORIES], maxLength: 32 },
  },
};

export const knowledgeUploadSchema: ValidationSchema = {
  allowOnlyBody: ['fileName', 'content', 'fileType', 'category', 'encoding'],
  body: {
    fileName: { type: 'string', required: true, minLength: 1, maxLength: 255 },
    content: { type: 'string', required: true, minLength: 1, maxLength: 2_000_000 },
    fileType: { type: 'string', enum: [...KNOWLEDGE_FILE_TYPES], maxLength: 16 },
    category: { type: 'string', enum: [...KNOWLEDGE_CATEGORIES], maxLength: 32 },
    encoding: { type: 'string', enum: ['base64', 'utf8'], maxLength: 16 },
  },
};

export const knowledgeFileIdParamSchema: ValidationSchema = {
  params: { id: UUID_PARAM },
};

export const teamInviteBodySchema: ValidationSchema = {
  allowOnlyBody: ['email', 'name', 'role'],
  body: {
    email: { type: 'email', required: true, maxLength: 254 },
    name: { type: 'string', required: true, minLength: 1, maxLength: 200 },
    role: { type: 'string', required: true, enum: [...TEAM_ROLES], maxLength: 32 },
  },
};

export const teamCreateBodySchema: ValidationSchema = {
  allowOnlyBody: ['userId', 'email', 'name', 'role'],
  body: {
    userId: { type: 'string', maxLength: 128 },
    email: { type: 'email', required: true, maxLength: 254 },
    name: { type: 'string', required: true, minLength: 1, maxLength: 200 },
    role: { type: 'string', required: true, enum: [...TEAM_ROLES], maxLength: 32 },
  },
};

export const teamUpdateBodySchema: ValidationSchema = {
  allowOnlyBody: ['name', 'role', 'status'],
  body: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    role: { type: 'string', enum: [...TEAM_ROLES], maxLength: 32 },
    status: { type: 'string', enum: [...TEAM_STATUSES], maxLength: 32 },
  },
};

export const teamMemberIdParamSchema: ValidationSchema = {
  params: { memberId: UUID_PARAM },
};

export const teamCheckPermissionBodySchema: ValidationSchema = {
  allowOnlyBody: ['userId', 'permission'],
  body: {
    userId: { type: 'string', required: true, minLength: 1, maxLength: 128 },
    permission: { type: 'string', required: true, minLength: 1, maxLength: 64 },
  },
};

export const teamSyncAuthBodySchema: ValidationSchema = {
  allowOnlyBody: [],
};

export const knowledgeTemplatesBodySchema: ValidationSchema = {
  allowOnlyBody: ['timezone', 'officeHours', 'services', 'pricing'],
  body: {
    timezone: { type: 'string', maxLength: 64 },
    officeHours: { type: 'array', maxLength: 7 },
    services: { type: 'array', maxLength: 100 },
    pricing: { type: 'array', maxLength: 100 },
  },
};

export const dashboardAssistantChatSchema: ValidationSchema = {
  allowOnlyBody: ['messages', 'page', 'pageTitle'],
  body: {
    messages: { type: 'array', required: true, maxLength: 30 },
    page: { type: 'string', maxLength: 120 },
    pageTitle: { type: 'string', maxLength: 80 },
  },
};

const CRM_CHANNELS = ['whatsapp', 'web_chat', 'instagram', 'facebook'] as const;
const CRM_CHANNEL_STATUSES = ['not_connected', 'connected', 'error'] as const;

export const crmIdParamSchema: ValidationSchema = {
  params: { id: UUID_PARAM },
};

export const crmStageCreateBodySchema: ValidationSchema = {
  allowOnlyBody: ['name', 'position'],
  body: {
    name: { type: 'string', required: true, minLength: 1, maxLength: 200 },
    position: { type: 'number', minimum: 0, maximum: 100_000 },
  },
};

export const crmStageUpdateBodySchema: ValidationSchema = {
  allowOnlyBody: ['name', 'position'],
  body: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    position: { type: 'number', minimum: 0, maximum: 100_000 },
  },
};

export const crmCompanyCreateBodySchema: ValidationSchema = {
  allowOnlyBody: ['name', 'website', 'industry', 'notes'],
  body: {
    name: { type: 'string', required: true, minLength: 1, maxLength: 300 },
    website: { type: 'string', maxLength: 2048 },
    industry: { type: 'string', maxLength: 128 },
    notes: { type: 'string', maxLength: 5000 },
  },
};

export const crmCompanyUpdateBodySchema: ValidationSchema = {
  allowOnlyBody: ['name', 'website', 'industry', 'notes'],
  body: {
    name: { type: 'string', minLength: 1, maxLength: 300 },
    website: { type: 'string', maxLength: 2048 },
    industry: { type: 'string', maxLength: 128 },
    notes: { type: 'string', maxLength: 5000 },
  },
};

export const crmContactCreateBodySchema: ValidationSchema = {
  allowOnlyBody: ['name', 'companyId', 'phone', 'email', 'notes'],
  body: {
    name: { type: 'string', required: true, minLength: 1, maxLength: 300 },
    companyId: { type: 'uuid' },
    phone: { type: 'string', minLength: 3, maxLength: 32 },
    email: { type: 'email', maxLength: 254 },
    notes: { type: 'string', maxLength: 5000 },
  },
};

export const crmContactUpdateBodySchema: ValidationSchema = {
  allowOnlyBody: ['name', 'companyId', 'phone', 'email', 'notes'],
  body: {
    name: { type: 'string', minLength: 1, maxLength: 300 },
    companyId: { type: 'uuid' },
    phone: { type: 'string', minLength: 3, maxLength: 32 },
    email: { type: 'email', maxLength: 254 },
    notes: { type: 'string', maxLength: 5000 },
  },
};

export const crmDealCreateBodySchema: ValidationSchema = {
  allowOnlyBody: ['title', 'stageId', 'contactId', 'companyId', 'value', 'currency', 'notes'],
  body: {
    title: { type: 'string', required: true, minLength: 1, maxLength: 300 },
    stageId: { type: 'uuid' },
    contactId: { type: 'uuid' },
    companyId: { type: 'uuid' },
    value: { type: 'number', minimum: 0, maximum: 999_999_999_999.99 },
    currency: { type: 'string', minLength: 3, maxLength: 3 },
    notes: { type: 'string', maxLength: 5000 },
  },
};

export const crmDealUpdateBodySchema: ValidationSchema = {
  allowOnlyBody: ['title', 'stageId', 'contactId', 'companyId', 'value', 'currency', 'notes'],
  body: {
    title: { type: 'string', minLength: 1, maxLength: 300 },
    stageId: { type: 'uuid' },
    contactId: { type: 'uuid' },
    companyId: { type: 'uuid' },
    value: { type: 'number', minimum: 0, maximum: 999_999_999_999.99 },
    currency: { type: 'string', minLength: 3, maxLength: 3 },
    notes: { type: 'string', maxLength: 5000 },
  },
};

export const channelParamSchema: ValidationSchema = {
  params: {
    channel: { type: 'string', required: true, enum: [...CRM_CHANNELS], maxLength: 32 },
  },
};

export const channelUpsertBodySchema: ValidationSchema = {
  allowOnlyBody: ['status', 'config'],
  body: {
    status: { type: 'string', enum: [...CRM_CHANNEL_STATUSES], maxLength: 32 },
    config: { type: 'object' },
  },
};

export const tenantCreateBodySchema: ValidationSchema = {
  allowOnlyBody: [
    'business_name',
    'phone_number',
    'services_offered',
    'tone',
    'question_flow',
    'integrations',
    'industry',
    'industries',
    'language_mode',
    'owner_user_id',
    'timezone',
    'business_hours',
    'agent_name',
    'voice_id',
    'system_prompt',
    'capabilities',
  ],
  body: {
    business_name: { type: 'string', required: true, minLength: 1, maxLength: 200 },
    phone_number: { type: 'string', maxLength: 32 },
    services_offered: { type: 'array', maxLength: 50 },
    tone: { type: 'string', maxLength: 64 },
    question_flow: { type: 'array', maxLength: 100 },
    integrations: { type: 'object' },
    industry: { type: 'string', maxLength: 128 },
    industries: { type: 'array', maxLength: 20 },
    language_mode: { type: 'string', maxLength: 16 },
    owner_user_id: { type: 'uuid' },
    timezone: { type: 'string', maxLength: 64 },
    business_hours: { type: 'object' },
    agent_name: { type: 'string', maxLength: 100 },
    voice_id: { type: 'string', maxLength: 128 },
    system_prompt: { type: 'string', maxLength: 16_000 },
    capabilities: { type: 'object' },
  },
};

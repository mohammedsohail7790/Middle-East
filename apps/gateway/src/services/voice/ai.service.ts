import { CacheManager } from '../cache.js';
import { logger } from '../logger.js';
import { appointmentService } from '../appointments/appointment.service.js';
import { knowledgeService } from '../knowledge/knowledge.service.js';
import { buildIndustryConfig, getIndustryConfig, INDUSTRY_KEYS } from '../industry/index.js';
import {
    formatDefaultGreeting,
    normalizeGreetingText,
} from '../realtime/receptionist-voice.js';
import { aiCircuitBreaker } from './circuit-breaker.js';
import { pool } from '../db/pool.js';

export type TranscriptRole = 'user' | 'assistant' | 'system';

export interface TranscriptTurn {
    role: TranscriptRole;
    text: string;
    timestamp: string;
}

export interface VoiceLeadPayload {
    name?: string;
    phone?: string;
    service?: string;
    preferred_time?: string;
    notes?: string;
    summary?: string;
}

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'ave', 'blvd', 'inc', 'ltd', 'co', 'etc', 'vs', 'dept', 'apt', 'est', 'hvac']);

export interface TenantVoiceConfig {
    tenantId: string;
    businessName: string;
    industry?: string;
    /** Plain-language business overview from dashboard settings / AI config */
    businessDescription?: string;
    services: string[];
    tone: string;
    questions: string[];
    defaultLanguage: string;
    languageMode?: 'strict' | 'adaptive';
    timezone: string;
    workingHours?: string;
    diagnosticFee: number;
    transferPhoneNumber?: string;
    callHandlingMode: 'message' | 'transfer' | 'both';
    integrations: {
        zapierWebhookUrl?: string;
    };
    agentName: string;
    welcomeMessage: string;
    voiceId?: string;
    /** From voice_tenants.system_prompt or metadata.custom_prompt */
    customSystemPrompt?: string;
    /** Routed ai_agents row when call hits a number with ai_agent_id */
    routedAgentId?: string;
    routedAgentRole?: string;
    capabilities?: {
        bookAppointments?: boolean;
        transferCalls?: boolean;
        collectPayments?: boolean;
        sendSMS?: boolean;
        accessKnowledge?: boolean;
    };
    /** Service-area check for on-site visits (metadata.service_area) */
    serviceArea?: {
        enabled: boolean;
        mode: 'miles' | 'minutes';
        limit: number;
        address: string;
    };
    /** Compliance Center settings — drives TwiML preamble and prompt injection */
    complianceSettings?: {
        aiDisclosureEnabled: boolean;
        aiDisclosureMessage: string;
        recordingEnabled: boolean;
        consentRequired: boolean;
        industryProfile: string;
    };
}

export interface AppointmentAction {
    type: 'schedule_appointment' | 'reschedule_appointment' | 'transfer_call';
    payload: {
        name?: string;
        phone?: string;
        service?: string;
        time?: string;
        appointmentId?: string;
        reason?: string; // For transfer_call
    };
}

export interface CallEvaluationResult {
    sentiment: 'positive' | 'neutral' | 'negative';
    sentimentScore: number;
    frustrationLevel: number;
    callSuccess: boolean;
    leadQuality: 'high' | 'medium' | 'low';
    summary: string;
}

export interface AppointmentActionResult {
    type: 'appointment' | 'reschedule' | 'transfer';
    success: boolean;
    message: string;
    payload: {
        name?: string;
        phone?: string;
        service?: string;
        time?: string;
        appointmentId?: string;
        reason?: string; // For transfer_call
        transferNumber?: string;
    };
}

interface AiResponse {
    reply: string;
    extractedLead: VoiceLeadPayload;
    actions: AppointmentAction[];
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface StreamCallbacks {
    onSentence: (sentence: string, isFirst: boolean) => Promise<void>;
    onFirstToken?: () => void;
    onKnowledgeRetrieved?: (knowledgeContext: string) => void;
}

const DEFAULT_TONE = 'friendly, concise, and professional';

export class AiService {
    private readonly openAiKey = process.env.OPENAI_API_KEY;
    private readonly openAiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    private readonly cache = new CacheManager();
    private readonly db = pool;

    async getTenantVoiceConfig(tenantId: string, phoneAgentId?: string | null): Promise<TenantVoiceConfig> {
        const cacheKey = phoneAgentId
            ? `voice:tenant:${tenantId}:agent:${phoneAgentId}`
            : `voice:tenant:${tenantId}`;
        const { getVoiceTenantConfigRevision } = await import('./voice-config-cache.js');
        const configRev = await getVoiceTenantConfigRevision(tenantId);
        const cached = await this.cache.get<TenantVoiceConfig & { _configRev?: string }>(cacheKey);
        if (cached && cached._configRev === configRev) {
            const { _configRev, ...rest } = cached;
            return rest;
        }

        const query = `
            select
                vt.id as tenant_id,
                coalesce(vt.company_name, 'Business') as business_name,
                coalesce(nullif(trim(vt.metadata->>'industry'), ''), 'general') as industry,
                coalesce(vt.voice_services, '[]'::jsonb) as voice_services,
                coalesce(ac.services_offered, '[]'::jsonb) as ai_services_offered,
                coalesce(ac.tone, vt.voice_tone, $2) as tone,
                coalesce(vt.voice_questions, '[]'::jsonb) as questions,
                coalesce(ac.language, vt.default_language, 'en') as default_language,
                coalesce(vt.metadata->>'language_mode', 'adaptive') as language_mode,
                coalesce(vt.timezone, 'UTC') as timezone,
                coalesce(nullif(trim(ac.business_hours_description), ''), nullif(trim(vt.metadata->>'working_hours'), ''), '') as working_hours,
                coalesce(vt.diagnostic_fee, 0) as diagnostic_fee,
                vt.transfer_phone_number,
                coalesce(vt.call_handling_mode, 'message') as call_handling_mode,
                vt.zapier_webhook_url,
                coalesce(ac.voice_id, vt.voice_id) as voice_id,
                vt.metadata,
                nullif(trim(vt.system_prompt), '') as system_prompt,
                ac.agent_name as ai_agent_name,
                ac.greeting_message as ai_greeting_message,
                nullif(trim(ac.business_description), '') as business_description
            from public.voice_tenants vt
            left join public.ai_agent_configs ac on ac.tenant_id = vt.id
            where vt.id = $1
            limit 1
        `;
        const result = await this.db.query(query, [tenantId, DEFAULT_TONE]);
        if (!result.rows.length) {
            throw new Error(`Voice tenant config not found for tenant ${tenantId}`);
        }

        const row = result.rows[0];
        const rawIndustry = String(row.industry || 'general').toLowerCase().trim();
        let industry = INDUSTRY_KEYS.includes(rawIndustry) ? rawIndustry : 'general';

        const aiServices = Array.isArray(row.ai_services_offered)
            ? row.ai_services_offered.map(String).filter(Boolean)
            : [];
        const voiceServices = Array.isArray(row.voice_services)
            ? row.voice_services.map(String).filter(Boolean)
            : [];
        const tenantServices =
            aiServices.length > 0 ? aiServices : voiceServices.length > 0 ? voiceServices : undefined;

        const businessDescription =
            typeof row.business_description === 'string' ? row.business_description.trim() : '';
        const tradeHint = `${businessDescription} ${(tenantServices || []).join(' ')}`.toLowerCase();
        const looksLikeHvac =
            /\b(hvac|heating|cooling|furnace|air condition|a\/c|ac repair)\b/i.test(tradeHint);
        if (industry === 'hvac' && businessDescription && !looksLikeHvac) {
            industry = 'general';
        }

        const industryCfg = buildIndustryConfig({
            industry,
            businessName: row.business_name,
            overrideWorkingHours: row.working_hours || undefined,
            overrideDiagnosticFee: Number(row.diagnostic_fee ?? 0),
            overrideCallHandlingMode: row.call_handling_mode as 'message' | 'transfer' | 'both' | undefined,
            overridePrompt:
                row.metadata?.custom_prompt ||
                (typeof row.system_prompt === 'string' ? row.system_prompt : undefined) ||
                undefined,
            overrideGreeting: row.metadata?.custom_greeting || undefined,
            overrideServices: tenantServices,
        });

        const defaultAgentName = 'Sarah';
        const agentName =
            row.ai_agent_name ||
            row.metadata?.agent_name ||
            defaultAgentName;
        const customWelcome =
            row.ai_greeting_message ||
            row.metadata?.welcome_message ||
            row.metadata?.custom_greeting;
        const welcomeMessage = normalizeGreetingText(
            customWelcome
                ? String(customWelcome)
                      .replace(/\[Business\]/g, row.business_name)
                      .replace(/\[Agent\]/g, agentName)
                : formatDefaultGreeting(row.business_name, agentName)
        );

        const customSystemPrompt =
            (typeof row.metadata?.custom_prompt === 'string' && row.metadata.custom_prompt.trim()) ||
            (typeof row.system_prompt === 'string' && row.system_prompt.trim()) ||
            undefined;

        const config: TenantVoiceConfig = {
            tenantId: row.tenant_id,
            businessName: row.business_name,
            industry,
            businessDescription: businessDescription || undefined,
            services:
                tenantServices && tenantServices.length > 0
                    ? tenantServices
                    : industryCfg.services,
            tone: row.tone ?? DEFAULT_TONE,
            questions: [...industryCfg.industryQuestions, ...(row.questions ?? [])],
            defaultLanguage: row.default_language ?? 'en',
            languageMode: row.language_mode === 'strict' ? 'strict' : 'adaptive',
            timezone: row.timezone ?? 'UTC',
            workingHours: industryCfg.workingHours,
            diagnosticFee: industryCfg.diagnosticFee,
            transferPhoneNumber: row.transfer_phone_number ?? undefined,
            callHandlingMode: industryCfg.callHandlingMode,
            integrations: {
                zapierWebhookUrl: row.zapier_webhook_url ?? undefined,
            },
            agentName,
            welcomeMessage,
            voiceId: row.voice_id ?? undefined,
            customSystemPrompt,
            capabilities: row.metadata?.capabilities,
        };

        const { parseServiceAreaSettings } = await import('./service-area.service.js');
        const serviceArea = parseServiceAreaSettings(row.metadata?.service_area);
        if (serviceArea) config.serviceArea = serviceArea;

        if (phoneAgentId) {
            await this.applyPhoneAgentOverrides(config, tenantId, phoneAgentId);
        }

        // Load compliance settings (non-blocking — failure returns defaults)
        try {
            const { complianceCenterService } = await import('../compliance/compliance-center.service.js');
            const cs = await complianceCenterService.getSettings(tenantId);
            config.complianceSettings = {
                aiDisclosureEnabled: cs.aiDisclosureEnabled,
                aiDisclosureMessage: cs.aiDisclosureMessage,
                recordingEnabled: cs.recordingEnabled,
                consentRequired: cs.consentRequired,
                industryProfile: cs.industryProfile,
            };
        } catch {
            // non-fatal — compliance settings are optional
        }

        await this.cache.set(
            cacheKey,
            { ...config, _configRev: configRev },
            { ttl: 30, tags: [`voice-tenant:${tenantId}`] }
        );
        return config;
    }

    private async applyPhoneAgentOverrides(
        config: TenantVoiceConfig,
        tenantId: string,
        agentId: string
    ): Promise<void> {
        const agent = await this.db.query(
            `SELECT id, name, role, system_prompt, voice_id, tone, services, transfer_number, knowledge_category
             FROM public.ai_agents
             WHERE id = $1 AND tenant_id = $2 AND active = true
             LIMIT 1`,
            [agentId, tenantId]
        );
        if (!agent.rows.length) return;

        const row = agent.rows[0];
        config.routedAgentId = row.id;
        config.routedAgentRole = row.role;
        config.agentName = row.name || config.agentName;
        config.customSystemPrompt = row.system_prompt || config.customSystemPrompt;
        config.voiceId = row.voice_id || config.voiceId;
        config.tone = row.tone || config.tone;
        if (row.transfer_number) config.transferPhoneNumber = row.transfer_number;
        if (Array.isArray(row.services) && row.services.length > 0) {
            config.services = row.services;
        }
        config.welcomeMessage = normalizeGreetingText(
            formatDefaultGreeting(config.businessName, config.agentName)
        );
        if (row.knowledge_category) {
            (config as TenantVoiceConfig & { knowledgeCategory?: string }).knowledgeCategory =
                row.knowledge_category;
        }
    }

    buildPrompt(config: TenantVoiceConfig, language: string): string {
        const industryBase = (() => {
            try { return getIndustryConfig(config.industry || 'general').systemPrompt.replace(/\[Business\]/g, config.businessName); }
            catch { return null; }
        })();

        const fee = `$${config.diagnosticFee} diagnostic (waived if repair proceeds)`;
        const hours = config.workingHours ? `HOURS: ${config.workingHours}` : '';
        const questions = config.questions.length ? config.questions.slice(0, 4).join('; ') : 'name, phone, service, preferred time';

        const modeInstructions: Record<string, string> = {
            message: 'Take messages only, no transfers.',
            transfer: 'Transfer to human when caller needs help.',
            both: 'Ask preference: message or transfer.',
        };
        const mode = `${config.callHandlingMode.toUpperCase()}: ${modeInstructions[config.callHandlingMode] || 'both'}`;

        // Compliance awareness lines injected into system prompt
        const complianceLines: string[] = [];
        if (config.complianceSettings?.aiDisclosureEnabled) {
            complianceLines.push('You have already been announced as an AI assistant at the start of this call.');
        }
        if (config.complianceSettings?.recordingEnabled) {
            complianceLines.push('This call is being recorded.');
        }
        const complianceContext = complianceLines.length
            ? `\nCOMPLIANCE: ${complianceLines.join(' ')}`
            : '';

        return `${industryBase || 'You are a phone receptionist.'}

BUSINESS: ${config.businessName} | ${config.industry || 'General'} | ${config.services.slice(0, 4).join(', ')}
FEE: ${fee}
${hours}${complianceContext}

STYLE: Sound like a competent human receptionist — calm, warm, unhurried. Speak naturally with contractions. Keep replies short (1-2 sentences). Ask one question at a time. Never be robotic, scripted, or overly formal. Do NOT enumerate options. Do NOT list things. Sound like a real person helping a caller.

CRITICAL RULES:
- Never repeat your introduction or re-greet.
- Never thank or apologize excessively.
- Never say "I understand" or "I hear you" — just respond.
- If the caller changes topic, drop the previous flow entirely.
- One question per turn. Never ask multiple questions.
- Wait for the caller to respond before asking the next question.
- If unsure, take a message rather than guessing.

EMOTION ({detectedEmotion}): frustrated=acknowledge briefly then move on | urgent=direct and fast | confused=simplify and clarify | neutral=standard warm tone

BOOKING: Collect gradually — one piece of info at a time. Name → phone → service → preferred time.

TOPICS: ${questions}

LANG: ${config.languageMode === 'strict' ? `Respond only in ${language}.` : 'Match caller language naturally, default English.'}
${mode}
CALLER PAST: {callerMemory}`;
    }

    async generateVoiceReply(
        tenantConfig: TenantVoiceConfig,
        transcript: TranscriptTurn[],
        language: string,
        adaptive?: { maxTokens: number; skipEnrichment: boolean; skipEmotion: boolean; skipLeadRetry: boolean; skipAppointmentActions: boolean },
    ): Promise<AiResponse> {
        if (!this.openAiKey) {
            throw new Error('OPENAI_API_KEY is required for voice AI');
        }

        return aiCircuitBreaker.execute(async () => {
            return this._generateVoiceReply(tenantConfig, transcript, language, adaptive);
        });
    }

    private async _generateVoiceReply(
        tenantConfig: TenantVoiceConfig,
        transcript: TranscriptTurn[],
        language: string,
        _adaptive?: { maxTokens: number; skipEnrichment: boolean; skipEmotion: boolean; skipLeadRetry: boolean; skipAppointmentActions: boolean },
    ): Promise<AiResponse> {
        const enableKnowledge = (process.env.ENABLE_KNOWLEDGE_INGESTION || 'false').toLowerCase() === 'true';
        const lastUser = [...transcript].reverse().find((t) => t.role === 'user')?.text || '';

        const detectedEmotion = this.detectEmotion(lastUser);
        const callerMemory = await this.getCallerMemory(tenantConfig.tenantId, transcript);

        let knowledge: Array<{ category: string; content: string }> = [];

        if (enableKnowledge && lastUser) {
            try {
                knowledge = await knowledgeService.searchRelevantKnowledge(lastUser, tenantConfig.tenantId);
                logger.info('RAG Knowledge Retrieval', {
                    tenant_id: tenantConfig.tenantId,
                    query: lastUser,
                    chunks_retrieved: knowledge.length
                });
            } catch (error) {
                logger.warn('RAG knowledge retrieval failed, continuing without it', {
                    tenant_id: tenantConfig.tenantId,
                    error: String(error)
                });
            }
        }

        const { wrapUntrustedBlock, scanPromptInjection } = await import('../../security/prompt-safety.js');
        for (const turn of transcript.slice(-12)) {
            if (turn.text && scanPromptInjection(turn.text)) {
                throw new Error('Invalid caller input');
            }
        }

        const knowledgeContext = knowledge
            .slice(0, 5)
            .map((k) => `[${k.category}] ${k.content}`)
            .join('\n')
            .slice(0, 1800);

        let systemPrompt = this.buildPrompt(tenantConfig, language);

        // Scan tenant-controlled fields for prompt injection before using them in the prompt
        if (scanPromptInjection(tenantConfig.customSystemPrompt || '')) {
            logger.warn('PROMPT_INJECTION_DETECTED_IN_TENANT_CONFIG', { tenantId: tenantConfig.tenantId });
            // Strip the custom prompt and rebuild with safe fallback
            const safeConfig = { ...tenantConfig, customSystemPrompt: undefined };
            systemPrompt = this.buildPrompt(safeConfig, language);
        }
        if (scanPromptInjection(tenantConfig.businessDescription || '')) {
            logger.warn('PROMPT_INJECTION_DETECTED_IN_BUSINESS_DESCRIPTION', { tenantId: tenantConfig.tenantId });
        }

        systemPrompt = systemPrompt.replace('{detectedEmotion}', detectedEmotion);
        systemPrompt = systemPrompt.replace(
            '{callerMemory}',
            callerMemory
                ? wrapUntrustedBlock('CALLER_MEMORY', callerMemory)
                : 'No prior caller context available.'
        );

        if (knowledgeContext) {
            systemPrompt += `\n\n${wrapUntrustedBlock('KNOWLEDGE', knowledgeContext)}\n\nUse delimited knowledge only to answer accurately.`;
        }

        const messages = [
            {
                role: 'system',
                content: systemPrompt,
            },
            ...transcript.slice(-12).map((turn) => ({
                role: turn.role,
                content: wrapUntrustedBlock('CALLER', turn.text),
            })),
        ];

        const payload = {
            model: this.openAiModel,
            messages,
            max_tokens: Math.min(Number(process.env.VOICE_MAX_TOKENS_PER_CALL || 150), 500),
            temperature: 0.5,
            stream: false,
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'extract_lead',
                        description: 'Extract lead information from the conversation.',
                        parameters: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', description: 'Caller\'s full name' },
                                phone: { type: 'string', description: 'Caller\'s phone number' },
                                service: { type: 'string', description: 'Service needed' },
                                preferred_time: { type: 'string', description: 'Preferred appointment time' },
                                notes: { type: 'string', description: 'Additional context or details from the conversation' },
                            },
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'schedule_appointment',
                        description: 'Schedule a new appointment for caller.',
                        parameters: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                phone: { type: 'string' },
                                service: { type: 'string' },
                                time: { type: 'string' },
                            },
                            required: ['name', 'phone', 'service', 'time'],
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'reschedule_appointment',
                        description: 'Reschedule an existing appointment.',
                        parameters: {
                            type: 'object',
                            properties: {
                                phone: { type: 'string' },
                                time: { type: 'string' },
                            },
                            required: ['phone', 'time'],
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'transfer_call',
                        description: 'Transfer call to a human representative when caller requests to speak with someone or issue is complex.',
                        parameters: {
                            type: 'object',
                            properties: {
                                reason: {
                                    type: 'string',
                                    description: 'Brief reason for transfer (e.g., "customer requested human", "complex technical issue")',
                                },
                            },
                            required: ['reason'],
                        },
                    },
                },
            ],
            tool_choice: 'auto',
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.openAiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(Number(process.env.OPENAI_TIMEOUT_MS || 12000)),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`OpenAI failure (${response.status}): ${body}`);
        }

        const completion = (await response.json()) as any;
        const choice = completion.choices?.[0]?.message;
        const reply = choice?.content?.trim() || 'Could you repeat that for me?';

        let extractedLead: VoiceLeadPayload = {};
        const actions: AppointmentAction[] = [];
        const toolCalls = choice?.tool_calls ?? [];
        for (const call of toolCalls) {
            try {
                const name = call?.function?.name;
                const args = JSON.parse(call.function.arguments || '{}') as Record<string, string>;
                if (name === 'extract_lead') {
                    extractedLead = args as VoiceLeadPayload;
                } else if (name === 'schedule_appointment' || name === 'reschedule_appointment' || name === 'transfer_call') {
                    actions.push({
                        type: name,
                        payload: {
                            name: args.name,
                            phone: args.phone,
                            service: args.service,
                            time: args.time,
                            reason: args.reason, // For transfer_call
                        },
                    });
                }
            } catch (error) {
                logger.warn('Failed parsing OpenAI tool call', { error: String(error) });
            }
        }

        const usage = completion.usage;
        return {
            reply,
            extractedLead,
            actions,
            usage: usage ? {
                promptTokens: usage.prompt_tokens ?? 0,
                completionTokens: usage.completion_tokens ?? 0,
                totalTokens: usage.total_tokens ?? 0,
            } : undefined,
        };
    }

    async streamGenerateVoiceReply(
        tenantConfig: TenantVoiceConfig,
        transcript: TranscriptTurn[],
        language: string,
        callbacks: StreamCallbacks,
        memorySnippet?: string,
        adaptive?: { maxTokens: number; skipEnrichment: boolean; skipEmotion: boolean; skipLeadRetry: boolean; skipAppointmentActions: boolean },
    ): Promise<AiResponse> {
        if (!this.openAiKey) {
            throw new Error('OPENAI_API_KEY is required for voice AI');
        }
        return aiCircuitBreaker.execute(async () => {
            return this._streamGenerateVoiceReplyImpl(tenantConfig, transcript, language, callbacks, memorySnippet, adaptive);
        });
    }

    private async _streamGenerateVoiceReplyImpl(
        tenantConfig: TenantVoiceConfig,
        transcript: TranscriptTurn[],
        language: string,
        callbacks: StreamCallbacks,
        memorySnippet?: string,
        adaptive?: { maxTokens: number; skipEnrichment: boolean; skipEmotion: boolean; skipLeadRetry: boolean; skipAppointmentActions: boolean },
    ): Promise<AiResponse> {
        const enableKnowledge = (process.env.ENABLE_KNOWLEDGE_INGESTION || 'false').toLowerCase() === 'true';
        const lastUser = [...transcript].reverse().find((t) => t.role === 'user')?.text || '';

        const detectedEmotion = this.detectEmotion(lastUser);
        const callerMemory = await this.getCallerMemory(tenantConfig.tenantId, transcript);

        let knowledge: Array<{ category: string; content: string }> = [];
        if (enableKnowledge && lastUser) {
            try {
                knowledge = await knowledgeService.searchRelevantKnowledge(lastUser, tenantConfig.tenantId);
            } catch (error) {
                logger.warn('RAG knowledge retrieval failed, continuing without it', {
                    tenant_id: tenantConfig.tenantId, query: lastUser, error: String(error)
                });
            }
        }

        const { wrapUntrustedBlock, scanPromptInjection } = await import('../../security/prompt-safety.js');
        for (const turn of transcript.slice(-12)) {
            if (turn.text && scanPromptInjection(turn.text)) {
                throw new Error('Invalid caller input');
            }
        }

        const knowledgeContext = knowledge.slice(0, 5).map((k) => `[${k.category}] ${k.content}`).join('\n').slice(0, 1800);

        callbacks.onKnowledgeRetrieved?.(knowledgeContext);

        let systemPrompt = this.buildPrompt(tenantConfig, language);

        // Scan tenant-controlled fields for prompt injection before using them in the prompt
        if (scanPromptInjection(tenantConfig.customSystemPrompt || '')) {
            logger.warn('PROMPT_INJECTION_DETECTED_IN_TENANT_CONFIG', { tenantId: tenantConfig.tenantId });
            // Strip the custom prompt and rebuild with safe fallback
            const safeConfig = { ...tenantConfig, customSystemPrompt: undefined };
            systemPrompt = this.buildPrompt(safeConfig, language);
        }
        if (scanPromptInjection(tenantConfig.businessDescription || '')) {
            logger.warn('PROMPT_INJECTION_DETECTED_IN_BUSINESS_DESCRIPTION', { tenantId: tenantConfig.tenantId });
        }

        systemPrompt = systemPrompt.replace('{detectedEmotion}', detectedEmotion);
        systemPrompt = systemPrompt.replace(
            '{callerMemory}',
            callerMemory
                ? wrapUntrustedBlock('CALLER_MEMORY', callerMemory)
                : 'No prior caller context available.'
        );
        if (knowledgeContext) {
            systemPrompt += `\n\n${wrapUntrustedBlock('KNOWLEDGE', knowledgeContext)}\n\nUse delimited knowledge only to answer accurately.`;
        }
        if (memorySnippet) {
            systemPrompt += `\n${wrapUntrustedBlock('MEMORY', memorySnippet)}`;
        }

        const streamMessages = [
            { role: 'system', content: systemPrompt },
            ...transcript.slice(-12).map((turn) => ({
                role: turn.role,
                content: wrapUntrustedBlock('CALLER', turn.text),
            })),
        ];

        const payload = {
            model: this.openAiModel,
            messages: streamMessages,
            max_tokens: Math.min(adaptive?.maxTokens ?? 150, Number(process.env.VOICE_MAX_TOKENS_PER_CALL || 500)),
            temperature: 0.5,
            stream: true,
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'extract_lead',
                        description: 'Extract lead information from the conversation.',
                        parameters: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', description: 'Caller\'s full name' },
                                phone: { type: 'string', description: 'Caller\'s phone number' },
                                service: { type: 'string', description: 'Service needed' },
                                preferred_time: { type: 'string', description: 'Preferred appointment time' },
                                notes: { type: 'string', description: 'Additional context or details from the conversation' },
                            },
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'schedule_appointment',
                        description: 'Schedule a new appointment for caller.',
                        parameters: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                phone: { type: 'string' },
                                service: { type: 'string' },
                                time: { type: 'string' },
                            },
                            required: ['name', 'phone', 'service', 'time'],
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'reschedule_appointment',
                        description: 'Reschedule an existing appointment.',
                        parameters: {
                            type: 'object',
                            properties: {
                                phone: { type: 'string' },
                                time: { type: 'string' },
                            },
                            required: ['phone', 'time'],
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'transfer_call',
                        description: 'Transfer call to a human representative when caller requests to speak with someone or issue is complex.',
                        parameters: {
                            type: 'object',
                            properties: {
                                reason: { type: 'string', description: 'Brief reason for transfer' },
                            },
                            required: ['reason'],
                        },
                    },
                },
            ],
            tool_choice: 'auto',
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.openAiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(Number(process.env.OPENAI_TIMEOUT_MS || 12000)),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`OpenAI failure (${response.status}): ${body}`);
        }

        if (!response.body) throw new Error('No response body for streaming');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let fullContent = '';
        let sentenceBuffer = '';
        let isFirstSentence = true;
        const accumulatedToolCalls = new Map<number, { id: string; function: { name: string; arguments: string } }>();
        const MIN_SENTENCE_CHARS = 3;

        let gotFirstToken = false;
        const flushSentences = async (): Promise<void> => {
            while (sentenceBuffer.length >= MIN_SENTENCE_CHARS) {
                // Find first non-abbreviation sentence boundary (also matches EOS without trailing space)
                const re = /(?<=[.!?])(?:\s+|$)/g;
                let boundaryPos = -1;
                let m;
                while ((m = re.exec(sentenceBuffer)) !== null) {
                    const pos = m.index + m[0].length;
                    const preceding = sentenceBuffer.slice(0, m.index).trim();
                    const lastWord = preceding.split(/\s+/).pop() || '';
                    const clean = lastWord.replace(/[^a-zA-Z]/g, '').toLowerCase();
                    if (!ABBREVIATIONS.has(clean)) {
                        boundaryPos = pos;
                        break;
                    }
                }
                if (boundaryPos < 0) break;

                const sentence = sentenceBuffer.slice(0, boundaryPos).trim();
                sentenceBuffer = sentenceBuffer.slice(boundaryPos).trim();
                if (sentence) {
                    try {
                        await callbacks.onSentence(sentence, isFirstSentence);
                        isFirstSentence = false;
                    } catch (e) {
                        logger.warn('Streaming onSentence callback failed', { error: String(e), sentence });
                    }
                }
            }
        };

        // SSE streams terminate with a [DONE] sentinel; loop until the reader closes.
        // eslint-disable-next-line no-constant-condition -- intentional stream read loop
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const parts = sseBuffer.split('\n\n');
            sseBuffer = parts.pop() || '';

            for (const part of parts) {
                if (!part.trim()) continue;
                let dataLine = '';
                for (const line of part.split('\n')) {
                    if (line.startsWith('data: ')) {
                        dataLine = line.slice(6).trim();
                        break;
                    }
                }
                if (!dataLine || dataLine === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(dataLine);
                    const delta = parsed.choices?.[0]?.delta;
                    if (!delta) continue;

                    if (delta.content) {
                        if (!gotFirstToken) {
                            gotFirstToken = true;
                            callbacks.onFirstToken?.();
                        }
                        fullContent += delta.content;
                        sentenceBuffer += delta.content;
                        await flushSentences();
                    }

                    if (delta.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            const idx = tc.index;
                            if (!accumulatedToolCalls.has(idx)) {
                                accumulatedToolCalls.set(idx, { id: '', function: { name: '', arguments: '' } });
                            }
                            const entry = accumulatedToolCalls.get(idx)!;
                            if (tc.id) entry.id = tc.id;
                            if (tc.function) {
                                if (tc.function.name) entry.function.name = tc.function.name;
                                if (tc.function.arguments) entry.function.arguments += tc.function.arguments;
                            }
                        }
                    }
                } catch {
                    // skip malformed JSON
                }
            }
        }

        // Flush remaining sentence buffer
        const remaining = sentenceBuffer.trim();
        if (remaining) {
            try {
                await callbacks.onSentence(remaining, isFirstSentence);
                isFirstSentence = false;
            } catch (e) {
                logger.warn('Streaming onSentence flush failed', { error: String(e), sentence: remaining });
            }
        }

        let extractedLead: VoiceLeadPayload = {};
        const actions: AppointmentAction[] = [];
        const toolCallArray = Array.from(accumulatedToolCalls.values()).filter(tc => tc.function.name);
        for (const call of toolCallArray) {
            try {
                const name = call.function.name;
                const args = JSON.parse(call.function.arguments || '{}') as Record<string, string>;
                if (name === 'extract_lead') {
                    extractedLead = args as VoiceLeadPayload;
                } else if (name === 'schedule_appointment' || name === 'reschedule_appointment' || name === 'transfer_call') {
                    actions.push({
                        type: name as AppointmentAction['type'],
                        payload: {
                            name: args.name,
                            phone: args.phone,
                            service: args.service,
                            time: args.time,
                            appointmentId: args.appointmentId || args.appointment_id,
                            reason: args.reason,
                        },
                    });
                }
            } catch (error) {
                logger.warn('Failed parsing streaming tool call', { error: String(error) });
            }
        }

        const reply = fullContent.trim() || 'Could you repeat that for me?';
        return { reply, extractedLead, actions };
    }

    async executeAppointmentActions(
        tenantConfig: TenantVoiceConfig,
        actions: AppointmentAction[]
    ): Promise<AppointmentActionResult[]> {
        const responses: AppointmentActionResult[] = [];
        for (const action of actions) {
            if (action.type === 'schedule_appointment') {
                const payload = action.payload;
                if (!payload.name || !payload.phone || !payload.service || !payload.time) {
                    responses.push({
                        type: 'appointment',
                        success: false,
                        message: 'I need your name, phone, service, and preferred time to book this appointment.',
                        payload,
                    });
                    continue;
                }
                const result = await appointmentService.createAppointment({
                    tenantId: tenantConfig.tenantId,
                    name: payload.name,
                    phone: payload.phone,
                    service: payload.service,
                    time: payload.time,
                });
                responses.push({
                    type: 'appointment',
                    success: result.success,
                    message: result.message,
                    payload: {
                        ...payload,
                        time: result.scheduledTime || payload.time,
                    },
                });
            }
            if (action.type === 'reschedule_appointment') {
                const payload = action.payload;
                if (!payload.phone || !payload.time) {
                    responses.push({
                        type: 'reschedule',
                        success: false,
                        message: 'I need your phone number and new preferred time to reschedule.',
                        payload,
                    });
                    continue;
                }
                const result = await appointmentService.rescheduleAppointment(
                    tenantConfig.tenantId,
                    payload.time,
                    { phone: payload.phone, appointmentId: payload.appointmentId }
                );
                responses.push({
                    type: 'reschedule',
                    success: result.success,
                    message: result.message,
                    payload: {
                        ...payload,
                        time: result.scheduledTime || payload.time,
                    },
                });
            }
            if (action.type === 'transfer_call') {
                const payload = action.payload;
                const transferNumber = tenantConfig.transferPhoneNumber;
                
                if (!transferNumber) {
                    responses.push({
                        type: 'transfer',
                        success: false,
                        message: 'I apologize, but call transfer is not configured for this business. Let me take a message instead.',
                        payload,
                    });
                    continue;
                }
                
                responses.push({
                    type: 'transfer',
                    success: true,
                    message: `One moment please, I'll transfer you to our team.`,
                    payload: {
                        ...payload,
                        transferNumber,
                    },
                });
            }
        }
        return responses;
    }

    detectEmotion(text: string): string {
        const lower = text.toLowerCase();
        if (/(urgent|hurry|asap|right now|immediately|emergency|today|need it now)/i.test(lower)) return 'urgent';
        if (/(frustrat|angry|upset|annoyed|ridiculous|unacceptable|terrible|worst|furious|fed up|done with)/i.test(lower)) return 'frustrated';
        if (/(confus|don't understand|not sure|what do you mean|how does|can you explain|lost)/i.test(lower)) return 'confused';
        return 'neutral';
    }

    async getCallerMemory(tenantId: string, transcript: TranscriptTurn[]): Promise<string> {
        try {
            const callerPhone = transcript.find(t => t.role === 'user')?.text?.match(/(\+?\d{10,})/)?.[1];
            if (!callerPhone) return '';

            const result = await this.db.query(
                `select l.name, l.service, l.notes, l.preferred_time, c.created_at
                 from public.leads l
                 join public.calls c on c.id = l.call_id
                 where l.phone = $1 and l.tenant_id = $2
                 order by c.created_at desc
                 limit 3`,
                [callerPhone, tenantId]
            );

            if (result.rows.length === 0) return '';

            const history = result.rows.map((row: any, i: number) => {
                const label = i === 0 ? 'Last time' : `Previous visit ${i + 1}`;
                const date = row.created_at ? new Date(row.created_at).toLocaleDateString() : '';
                return `${label} (${date}): ${row.name || 'Unknown'} called about ${row.service || 'unknown service'}${row.notes ? ` — ${row.notes}` : ''}`;
            }).join(' ');

            return `Past interactions: ${history}`;
        } catch {
            return '';
        }
    }

    async detectLanguage(text: string, fallbackLanguage: string): Promise<string> {
        if (!this.openAiKey || !text.trim()) return fallbackLanguage || 'en';
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.openAiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.openAiModel,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    { 
                        role: 'system', 
                        content: 'Detect language code for text. Return JSON: {"language":"en|es|fr|zh|ru|ar|hi|ur"}. Supported: English(en), Spanish(es), French(fr), Mandarin(zh), Russian(ru), Arabic(ar), Hindi(hi), Urdu(ur).' 
                    },
                    { role: 'user', content: text },
                ],
            }),
            signal: AbortSignal.timeout(Number(process.env.OPENAI_TIMEOUT_MS || 12000)),
        });
        if (!response.ok) return fallbackLanguage || 'en';
        const completion = (await response.json()) as any;
        const content = completion.choices?.[0]?.message?.content || '{}';
        try {
            const parsed = JSON.parse(content) as { language?: string };
            const language = (parsed.language || fallbackLanguage || 'en').toLowerCase();
            // Support 8 languages: English, Spanish, French, Mandarin, Russian, Arabic, Hindi, Urdu
            if (['en', 'es', 'fr', 'zh', 'ru', 'ar', 'hi', 'ur'].includes(language)) return language;
            return fallbackLanguage || 'en';
        } catch {
            return fallbackLanguage || 'en';
        }
    }

    async validateLeadExtraction(
        config: TenantVoiceConfig,
        lead: VoiceLeadPayload,
        transcript: TranscriptTurn[]
    ): Promise<VoiceLeadPayload> {
        const normalized = this.normalizeLead(lead);
        if (this.hasRequiredLeadFields(normalized)) return normalized;

        const retry = await this.retryLeadExtraction(config, transcript);
        const retryNormalized = this.normalizeLead(retry);
        if (this.hasRequiredLeadFields(retryNormalized)) return retryNormalized;

        return {
            ...retryNormalized,
            notes: [retryNormalized.notes, 'Missing required lead fields: name/phone/service']
                .filter(Boolean)
                .join(' | '),
        };
    }

    private normalizeLead(lead: VoiceLeadPayload): VoiceLeadPayload {
        return {
            name: lead.name?.trim(),
            phone: lead.phone?.replace(/[^\d+]/g, '').trim(),
            service: lead.service?.trim(),
            preferred_time: lead.preferred_time?.trim(),
            notes: lead.notes?.trim(),
        };
    }

    private hasRequiredLeadFields(lead: VoiceLeadPayload): boolean {
        return Boolean(lead.name && lead.phone && lead.service);
    }

    private async retryLeadExtraction(config: TenantVoiceConfig, transcript: TranscriptTurn[]): Promise<VoiceLeadPayload> {
        if (!this.openAiKey) return {};

        const prompt = [
            'You are a system that extracts and summarizes customer call data.',
            '',
            'From the conversation, extract only useful business information.',
            '',
            `Business: ${config.businessName}`,
            `Services: ${config.services.length ? config.services.join(', ') : 'General customer support'}`,
            '',
            'Return JSON only with keys: name, phone, service, preferred_time, notes, summary.',
            'If the caller agreed to an appointment, set preferred_time to ISO 8601 for the agreed slot.',
            'Keep summary under 2 sentences.',
            'Do not hallucinate missing data. Extract only what is clearly mentioned.',
            'Notes should include important context or issue.',
            'Never add explanations.',
        ].join('\n');
        const recentText = transcript.slice(-16).map((t) => `${t.role}: ${t.text}`).join('\n');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.openAiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.openAiModel,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: prompt },
                    { role: 'user', content: recentText },
                ],
            }),
            signal: AbortSignal.timeout(Number(process.env.OPENAI_TIMEOUT_MS || 12000)),
        });
        if (!response.ok) return {};
        const completion = (await response.json()) as any;
        const content = completion.choices?.[0]?.message?.content || '{}';
        try {
            return JSON.parse(content) as VoiceLeadPayload;
        } catch (error) {
            logger.warn('Lead extraction retry parsing failed', { error: String(error) });
            return {};
        }
    }

    async evaluateCall(config: TenantVoiceConfig, transcript: TranscriptTurn[], lead: VoiceLeadPayload, hasAppointment: boolean): Promise<CallEvaluationResult> {
        if (!this.openAiKey) {
            return { sentiment: 'neutral', sentimentScore: 50, frustrationLevel: 0, callSuccess: hasAppointment || Boolean(lead.phone), leadQuality: 'low', summary: 'Evaluation unavailable (AI key missing).' };
        }

        const transcriptText = transcript.map(t => `${t.role}: ${t.text}`).join('\n');

        const systemPrompt = [
            'You are a call quality and sentiment analyzer.',
            '',
            'Analyze the full conversation transcript and return structured evaluation.',
            '',
            'Return JSON:',
            '{',
            '  "sentiment": "positive | neutral | negative",',
            '  "sentiment_score": 0-100,',
            '  "frustration_level": 0-100,',
            '  "call_success": true/false,',
            '  "lead_quality": "high | medium | low",',
            '  "summary": "<short summary>"',
            '}',
            '',
            'Evaluation rules:',
            '- sentiment_score: 0 = very negative, 100 = very positive',
            '- frustration_level: based on complaints, tone, repeated issues',
            '- call_success = true if:',
            '  • appointment booked OR',
            '  • clear lead captured OR',
            '  • issue resolved',
            '',
            '- lead_quality:',
            '  high → clear intent + contact info',
            '  medium → partial info',
            '  low → vague / no intent',
            '',
            '- summary: max 2 sentences',
            '- be objective, no assumptions',
        ].join('\n');

        const userPrompt = [
            `Business: ${config.businessName}`,
            `Industry: ${config.industry || 'General Services'}`,
            `Services: ${config.services.length ? config.services.join(', ') : 'General customer support'}`,
            '',
            `Lead extracted: ${JSON.stringify(lead)}`,
            `Appointment booked: ${hasAppointment}`,
            '',
            `Transcript:\n${transcriptText}`,
        ].join('\n');

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.openAiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.openAiModel,
                    temperature: 0,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                }),
                signal: AbortSignal.timeout(Number(process.env.OPENAI_TIMEOUT_MS || 12000)),
            });

            if (!response.ok) {
                logger.warn('Call evaluation API failed', { status: response.status });
                return { sentiment: 'neutral', sentimentScore: 50, frustrationLevel: 0, callSuccess: hasAppointment || Boolean(lead.phone), leadQuality: 'low', summary: 'Evaluation unavailable.' };
            }

            const completion = (await response.json()) as any;
            const content = completion.choices?.[0]?.message?.content || '{}';
            const parsed = JSON.parse(content);

            return {
                sentiment: ['positive', 'neutral', 'negative'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
                sentimentScore: Math.min(100, Math.max(0, Number(parsed.sentiment_score) || 50)),
                frustrationLevel: Math.min(100, Math.max(0, Number(parsed.frustration_level) || 0)),
                callSuccess: Boolean(parsed.call_success) || (hasAppointment && Boolean(lead.phone)),
                leadQuality: ['high', 'medium', 'low'].includes(parsed.lead_quality) ? parsed.lead_quality : 'low',
                summary: String(parsed.summary || '').slice(0, 300),
            };
        } catch (error) {
            logger.warn('Call evaluation failed', { error: String(error) });
            return { sentiment: 'neutral', sentimentScore: 50, frustrationLevel: 0, callSuccess: hasAppointment || Boolean(lead.phone), leadQuality: 'low', summary: 'Evaluation unavailable.' };
        }
    }
}


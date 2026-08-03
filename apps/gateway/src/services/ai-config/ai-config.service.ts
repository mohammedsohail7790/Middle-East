import { pool } from '../db/pool.js';
import { asJsonbArray, asJsonbObject, ensureJsonArray, ensureJsonObject } from '../db/pg-values.js';

/**
 * AI Configuration Service
 * Manages per-tenant AI agent customization
 */

export interface AIAgentConfig {
  id: string;
  tenantId: string;
  
  // Core AI Settings
  model: string;
  temperature: number;
  maxTokens: number;
  
  // Personality & Tone
  agentName: string;
  personality: string;
  tone: string;
  speakingStyle: string;
  
  // Business Context
  businessDescription?: string;
  servicesOffered: string[];
  serviceAreas: string[];
  businessHoursDescription?: string;
  
  // Conversation Flow
  greetingMessage: string;
  /** E.164 transfer target synced to voice_tenants.transfer_phone_number */
  transferPhoneNumber?: string;
  qualificationQuestions: any[];
  requiredFields: string[];
  optionalFields: string[];
  
  // Response Behavior
  maxConversationTurns: number;
  autoTransferEnabled: boolean;
  transferConditions?: any;
  fallbackMessage: string;
  
  // Custom Instructions
  systemInstructions?: string;
  doInstructions: string[];
  dontInstructions: string[];
  
  // Knowledge Base
  faqEnabled: boolean;
  customKnowledge?: string;
  
  // Integration Preferences
  autoCreateLead: boolean;
  autoScheduleAppointment: boolean;
  autoSendConfirmation: boolean;
  
  // Advanced Settings
  sentimentAnalysisEnabled: boolean;
  language: string;
  voiceId?: string;
  speechRate: number;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptTemplate {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  templateType: 'system' | 'greeting' | 'qualification' | 'closing' | 'fallback';
  templateContent: string;
  variables: Record<string, any>;
  isActive: boolean;
  priority: number;
}

export interface ConversationScenario {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  triggerKeywords: string[];
  customGreeting?: string;
  customQuestions: any[];
  customResponses: Record<string, any>;
  actions: any[];
  isActive: boolean;
  priority: number;
}

export class AIConfigService {
  /**
   * Get AI config for tenant (with defaults)
   */
  async getConfig(tenantId: string): Promise<AIAgentConfig> {
    try {
      const result = await pool.query(
        `SELECT tenant_id, model, temperature, max_tokens, agent_name, personality, tone, speaking_style,
                business_description, services_offered, service_areas, business_hours_description,
                greeting_message, qualification_questions, required_fields, optional_fields,
                max_conversation_turns, auto_transfer_enabled, transfer_conditions, fallback_message,
                system_instructions, do_instructions, dont_instructions,
                faq_enabled, custom_knowledge,
                auto_create_lead, auto_schedule_appointment, auto_send_confirmation,
                sentiment_analysis_enabled, language, voice_id, speech_rate
         FROM public.ai_agent_configs WHERE tenant_id = $1`,
        [tenantId]
      );

      if (result.rows.length === 0) {
        return this.enrichConfigWithTenantMeta(tenantId, this.getDefaultConfig(tenantId));
      }

      return this.enrichConfigWithTenantMeta(tenantId, this.mapToConfig(result.rows[0]));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/relation .* does not exist|42P01/i.test(msg)) {
        console.warn('[AI Config] ai_agent_configs missing; using defaults', { tenantId });
        return this.enrichConfigWithTenantMeta(tenantId, this.getDefaultConfig(tenantId));
      }
      console.error('[AI Config] Error getting config:', error);
      throw error;
    }
  }

  /**
   * Create or update AI config
   */
  async upsertConfig(
    tenantId: string,
    config: Partial<AIAgentConfig>,
    capabilities?: Record<string, boolean>
  ): Promise<AIAgentConfig> {
    const existing = await this.getConfig(tenantId);
    const merged: Partial<AIAgentConfig> = { ...existing, ...config };
    try {
      merged.qualificationQuestions = ensureJsonArray(merged.qualificationQuestions);
      merged.transferConditions = ensureJsonObject(merged.transferConditions) ?? {};
      merged.doInstructions = ensureJsonArray(merged.doInstructions).map(String);
      merged.dontInstructions = ensureJsonArray(merged.dontInstructions).map(String);
      merged.servicesOffered = ensureJsonArray(merged.servicesOffered).map(String);
      merged.serviceAreas = ensureJsonArray(merged.serviceAreas).map(String);
      merged.requiredFields = ensureJsonArray(merged.requiredFields).map(String);
      merged.optionalFields = ensureJsonArray(merged.optionalFields).map(String);

      const qualificationQuestionsJson = asJsonbArray(merged.qualificationQuestions);
      const transferConditionsJson = asJsonbObject(merged.transferConditions);
      const servicesOfferedJson = asJsonbArray(merged.servicesOffered);
      const serviceAreasJson = asJsonbArray(merged.serviceAreas);
      const requiredFieldsJson = asJsonbArray(merged.requiredFields);
      const optionalFieldsJson = asJsonbArray(merged.optionalFields);
      const doInstructionsJson = asJsonbArray(merged.doInstructions);
      const dontInstructionsJson = asJsonbArray(merged.dontInstructions);

      const result = await pool.query(
        `INSERT INTO public.ai_agent_configs (
          tenant_id, model, temperature, max_tokens,
          agent_name, personality, tone, speaking_style,
          business_description, services_offered, service_areas, business_hours_description,
          greeting_message, qualification_questions, required_fields, optional_fields,
          max_conversation_turns, auto_transfer_enabled, transfer_conditions, fallback_message,
          system_instructions, do_instructions, dont_instructions,
          faq_enabled, custom_knowledge,
          auto_create_lead, auto_schedule_appointment, auto_send_confirmation,
          sentiment_analysis_enabled, language, voice_id, speech_rate
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          ($10::text)::jsonb, ($11::text)::jsonb, $12, $13,
          ($14::text)::jsonb, ($15::text)::jsonb, ($16::text)::jsonb, $17, $18, ($19::text)::jsonb, $20, $21,
          ($22::text)::jsonb, ($23::text)::jsonb, $24, $25, $26, $27, $28, $29, $30, $31, $32
        )
        ON CONFLICT (tenant_id) DO UPDATE SET
          model = COALESCE($2, ai_agent_configs.model),
          temperature = COALESCE($3, ai_agent_configs.temperature),
          max_tokens = COALESCE($4, ai_agent_configs.max_tokens),
          agent_name = COALESCE($5, ai_agent_configs.agent_name),
          personality = COALESCE($6, ai_agent_configs.personality),
          tone = COALESCE($7, ai_agent_configs.tone),
          speaking_style = COALESCE($8, ai_agent_configs.speaking_style),
          business_description = COALESCE($9, ai_agent_configs.business_description),
          services_offered = EXCLUDED.services_offered,
          service_areas = EXCLUDED.service_areas,
          business_hours_description = COALESCE($12, ai_agent_configs.business_hours_description),
          greeting_message = COALESCE($13, ai_agent_configs.greeting_message),
          qualification_questions = EXCLUDED.qualification_questions,
          required_fields = EXCLUDED.required_fields,
          optional_fields = EXCLUDED.optional_fields,
          max_conversation_turns = EXCLUDED.max_conversation_turns,
          auto_transfer_enabled = EXCLUDED.auto_transfer_enabled,
          transfer_conditions = EXCLUDED.transfer_conditions,
          fallback_message = COALESCE($20, ai_agent_configs.fallback_message),
          system_instructions = COALESCE($21, ai_agent_configs.system_instructions),
          do_instructions = EXCLUDED.do_instructions,
          dont_instructions = EXCLUDED.dont_instructions,
          faq_enabled = COALESCE($24, ai_agent_configs.faq_enabled),
          custom_knowledge = COALESCE($25, ai_agent_configs.custom_knowledge),
          auto_create_lead = COALESCE($26, ai_agent_configs.auto_create_lead),
          auto_schedule_appointment = COALESCE($27, ai_agent_configs.auto_schedule_appointment),
          auto_send_confirmation = COALESCE($28, ai_agent_configs.auto_send_confirmation),
          sentiment_analysis_enabled = COALESCE($29, ai_agent_configs.sentiment_analysis_enabled),
          language = COALESCE($30, ai_agent_configs.language),
          voice_id = COALESCE($31, ai_agent_configs.voice_id),
          speech_rate = COALESCE($32, ai_agent_configs.speech_rate),
          updated_at = NOW()
        RETURNING *`,
        [
          tenantId,
          merged.model,
          merged.temperature,
          merged.maxTokens,
          merged.agentName,
          merged.personality,
          merged.tone,
          merged.speakingStyle,
          merged.businessDescription,
          servicesOfferedJson,
          serviceAreasJson,
          merged.businessHoursDescription,
          merged.greetingMessage,
          qualificationQuestionsJson,
          requiredFieldsJson,
          optionalFieldsJson,
          merged.maxConversationTurns,
          merged.autoTransferEnabled,
          transferConditionsJson,
          merged.fallbackMessage,
          merged.systemInstructions,
          doInstructionsJson,
          dontInstructionsJson,
          merged.faqEnabled,
          merged.customKnowledge,
          merged.autoCreateLead,
          merged.autoScheduleAppointment,
          merged.autoSendConfirmation,
          merged.sentimentAnalysisEnabled,
          merged.language,
          merged.voiceId,
          merged.speechRate,
        ]
      );

      console.log(`[AI Config] Config upserted for tenant ${tenantId}`);

      const mapped = this.mapToConfig(result.rows[0]);

      await this.syncTenantVoiceSettings(tenantId, mapped, {
        ...merged,
        capabilities,
      });

      try {
        const { invalidateVoiceTenantCache } = await import('../voice/voice-config-cache.js');
        await invalidateVoiceTenantCache(tenantId);
      } catch (cacheErr) {
        console.error('[AI Config] Cache invalidation failed:', cacheErr);
      }

      return mapped;
    } catch (error: unknown) {
      const pgCode = (error as { code?: string })?.code;
      const message = error instanceof Error ? error.message : String(error);
      const detail = (error as { detail?: string })?.detail;
      console.error('[AI Config] Error upserting config:', message, detail || '');

      if (/42703|column .* does not exist/i.test(message)) {
        await this.syncTenantVoiceSettings(tenantId, merged as AIAgentConfig, {
          ...config,
          capabilities,
        });
        console.warn('[AI Config] Partial schema — synced voice_tenants only', { tenantId });
        return this.enrichConfigWithTenantMeta(tenantId, { ...existing, ...config } as AIAgentConfig);
      }
      if (pgCode === '23503') {
        throw new Error(
          'AI settings could not be saved — run database migration 020_ai_agent_configs_voice_tenant_fk on Supabase.'
        );
      }
      const err = error instanceof Error ? error : new Error(message);
      if (detail) (err as Error & { detail?: string }).detail = detail;
      throw err;
    }
  }

  /**
   * Keep voice_tenants in sync with dashboard agent settings (used on live calls).
   */
  async syncTenantVoiceSettings(
    tenantId: string,
    saved: AIAgentConfig,
    incoming: Partial<AIAgentConfig> & { capabilities?: Record<string, boolean> }
  ): Promise<void> {
    try {
      const { voiceDb } = await import('../voice/tenant-scope.js');
      const existing = await voiceDb.query(
        `select metadata from public.voice_tenants where id = $1 limit 1`,
        [tenantId]
      );
      let priorMeta = existing.rows[0]?.metadata || {};
      if (typeof priorMeta === 'string') {
        try { priorMeta = JSON.parse(priorMeta); } catch { priorMeta = {}; }
      }
      const metadata = {
        ...priorMeta,
        capabilities: incoming.capabilities || priorMeta.capabilities,
        agent_name: saved.agentName,
        agent_display_name: saved.agentName,
        welcome_message: saved.greetingMessage?.trim() || priorMeta.welcome_message,
      };

      const transferIncoming = (incoming as { transferPhoneNumber?: string }).transferPhoneNumber;
      const metaPayload = JSON.parse(
        JSON.stringify({
          ...metadata,
          emergency_transfer_phone:
            transferIncoming !== undefined
              ? transferIncoming.trim() || null
              : priorMeta.emergency_transfer_phone,
        })
      ) as Record<string, unknown>;

      if (transferIncoming !== undefined) {
        await voiceDb.query(
          `update public.voice_tenants
           set voice_tone = coalesce($2, voice_tone),
               default_language = coalesce($3, default_language),
               voice_id = coalesce($4, voice_id),
               transfer_phone_number = $5,
               metadata = coalesce(metadata, '{}'::jsonb) || ($6::text)::jsonb,
               updated_at = now()
           where id = $1`,
          [
            tenantId,
            saved.tone,
            saved.language,
            saved.voiceId || null,
            transferIncoming.trim() || null,
            asJsonbObject(metaPayload),
          ]
        );
      } else {
        await voiceDb.query(
          `update public.voice_tenants
           set voice_tone = coalesce($2, voice_tone),
               default_language = coalesce($3, default_language),
               voice_id = coalesce($4, voice_id),
               metadata = coalesce(metadata, '{}'::jsonb) || ($5::text)::jsonb,
               updated_at = now()
           where id = $1`,
          [tenantId, saved.tone, saved.language, saved.voiceId || null, asJsonbObject(metaPayload)]
        );
      }
    } catch (err) {
      console.error('[AI Config] syncTenantVoiceSettings failed:', err);
    }
  }

  /**
   * Build system prompt from config
   */
  async buildSystemPrompt(tenantId: string, context?: Record<string, any>): Promise<string> {
    try {
      const config = await this.getConfig(tenantId);

      let prompt = `You are ${config.agentName}, the live phone receptionist for this business — a real person on the line, not a phone tree.\n\n`;

      // Personality & Tone
      prompt += `PERSONALITY: ${config.personality}\n`;
      prompt += `TONE: ${config.tone}\n`;
      prompt += `SPEAKING STYLE: ${config.speakingStyle}\n`;
      prompt += `Speak in natural conversational American English. Short sentences. One question at a time. Never say you are an AI.\n\n`;

      // Business Context
      if (config.businessDescription) {
        prompt += `BUSINESS: ${config.businessDescription}\n\n`;
      }

      if (config.servicesOffered.length > 0) {
        prompt += `SERVICES OFFERED:\n${config.servicesOffered.map((s) => `- ${s}`).join('\n')}\n\n`;
      }

      if (config.serviceAreas.length > 0) {
        prompt += `SERVICE AREAS: ${config.serviceAreas.join(', ')}\n\n`;
      }

      // Custom Instructions
      if (config.systemInstructions) {
        prompt += `INSTRUCTIONS:\n${config.systemInstructions}\n\n`;
      }

      if (config.doInstructions.length > 0) {
        prompt += `DO:\n${config.doInstructions.map((i) => `- ${i}`).join('\n')}\n\n`;
      }

      if (config.dontInstructions.length > 0) {
        prompt += `DON'T:\n${config.dontInstructions.map((i) => `- ${i}`).join('\n')}\n\n`;
      }

      // Required Fields
      prompt += `REQUIRED INFORMATION TO COLLECT:\n${config.requiredFields.map((f) => `- ${f}`).join('\n')}\n\n`;

      // Qualification Questions
      if (config.qualificationQuestions.length > 0) {
        prompt += `QUALIFICATION QUESTIONS:\n${config.qualificationQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n`;
      }

      // Custom Knowledge
      if (config.customKnowledge) {
        prompt += `KNOWLEDGE BASE:\n${config.customKnowledge}\n\n`;
      }

      // Response Guidelines
      prompt += `RESPONSE GUIDELINES:\n`;
      prompt += `- Keep responses short and conversational (voice-friendly)\n`;
      prompt += `- Ask one question at a time\n`;
      prompt += `- Confirm understanding before moving forward\n`;
      prompt += `- Be empathetic and helpful\n`;
      prompt += `- Maximum ${config.maxConversationTurns} conversation turns\n\n`;

      // Context
      if (context) {
        prompt += `CURRENT CONTEXT:\n${JSON.stringify(context, null, 2)}\n\n`;
      }

      return prompt;
    } catch (error) {
      console.error('[AI Config] Error building system prompt:', error);
      throw error;
    }
  }

  /**
   * Get prompt templates for tenant
   */
  async getPromptTemplates(
    tenantId: string,
    templateType?: string
  ): Promise<PromptTemplate[]> {
    try {
      let query = `
        SELECT * FROM public.ai_prompt_templates
        WHERE tenant_id = $1 AND is_active = true
      `;
      const params: any[] = [tenantId];

      if (templateType) {
        query += ` AND template_type = $2`;
        params.push(templateType);
      }

      query += ` ORDER BY priority DESC, created_at DESC`;

      const result = await pool.query(query, params);

      return result.rows.map(this.mapToPromptTemplate);
    } catch (error) {
      console.error('[AI Config] Error getting prompt templates:', error);
      throw error;
    }
  }

  /**
   * Create prompt template
   */
  async createPromptTemplate(
    tenantId: string,
    template: Omit<PromptTemplate, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>
  ): Promise<PromptTemplate> {
    try {
      const result = await pool.query(
        `INSERT INTO public.ai_prompt_templates 
         (tenant_id, name, description, template_type, template_content, variables, is_active, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          tenantId,
          template.name,
          template.description,
          template.templateType,
          template.templateContent,
          JSON.stringify(template.variables),
          template.isActive,
          template.priority,
        ]
      );

      console.log(`[AI Config] Prompt template created: ${result.rows[0].id}`);

      return this.mapToPromptTemplate(result.rows[0]);
    } catch (error) {
      console.error('[AI Config] Error creating prompt template:', error);
      throw error;
    }
  }

  /**
   * Get conversation scenarios for tenant
   */
  async getConversationScenarios(tenantId: string): Promise<ConversationScenario[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM public.ai_conversation_scenarios
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY priority DESC, created_at DESC`,
        [tenantId]
      );

      return result.rows.map(this.mapToScenario);
    } catch (error) {
      console.error('[AI Config] Error getting scenarios:', error);
      throw error;
    }
  }

  /**
   * Match scenario based on keywords
   */
  async matchScenario(
    tenantId: string,
    userInput: string
  ): Promise<ConversationScenario | null> {
    try {
      const scenarios = await this.getConversationScenarios(tenantId);

      for (const scenario of scenarios) {
        const keywords = scenario.triggerKeywords.map((k) => k.toLowerCase());
        const input = userInput.toLowerCase();

        if (keywords.some((keyword) => input.includes(keyword))) {
          return scenario;
        }
      }

      return null;
    } catch (error) {
      console.error('[AI Config] Error matching scenario:', error);
      return null;
    }
  }

  private async enrichConfigWithTenantMeta(
    tenantId: string,
    config: AIAgentConfig
  ): Promise<AIAgentConfig & { metadata?: { capabilities?: Record<string, boolean> } }> {
    try {
      const { voiceDb } = await import('../voice/tenant-scope.js');
      const row = await voiceDb.query(
        `select metadata, voice_id, transfer_phone_number from public.voice_tenants where id = $1 limit 1`,
        [tenantId]
      );
      let meta = row.rows[0]?.metadata || {};
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { meta = {}; }
      }
      return {
        ...config,
        voiceId: config.voiceId || row.rows[0]?.voice_id,
        transferPhoneNumber: row.rows[0]?.transfer_phone_number || undefined,
        metadata: { capabilities: meta.capabilities },
      };
    } catch {
      return config;
    }
  }

  /**
   * Get default config
   */
  private getDefaultConfig(tenantId: string): AIAgentConfig {
    return {
      id: '',
      tenantId,
      model: 'gpt-4',
      temperature: 0.35,
      maxTokens: 220,
      agentName: 'Sarah',
      personality: 'warm, direct, and professional — like a NYC front-desk receptionist',
      tone: 'professional',
      speakingStyle: 'concise and conversational',
      servicesOffered: [],
      serviceAreas: [],
      greetingMessage: 'Thanks for calling — how can I help you?',
      qualificationQuestions: [],
      requiredFields: ['name', 'phone', 'service'],
      optionalFields: ['email', 'preferred_time', 'notes'],
      maxConversationTurns: 20,
      autoTransferEnabled: false,
      fallbackMessage: 'Let me connect you with someone who can help.',
      doInstructions: [],
      dontInstructions: [],
      faqEnabled: true,
      autoCreateLead: true,
      autoScheduleAppointment: false,
      autoSendConfirmation: true,
      sentimentAnalysisEnabled: true,
      language: 'en',
      voiceId: 'marin',
      speechRate: 1.0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Map database row to AIAgentConfig
   */
  private mapToConfig(row: any): AIAgentConfig {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      model: row.model,
      temperature: row.temperature != null ? parseFloat(row.temperature) : 0.35,
      maxTokens: row.max_tokens ?? 220,
      agentName: row.agent_name,
      personality: row.personality,
      tone: row.tone,
      speakingStyle: row.speaking_style,
      businessDescription: row.business_description,
      servicesOffered: ensureJsonArray(row.services_offered).map(String),
      serviceAreas: ensureJsonArray(row.service_areas).map(String),
      businessHoursDescription: row.business_hours_description,
      greetingMessage: row.greeting_message,
      qualificationQuestions: ensureJsonArray(row.qualification_questions),
      requiredFields: ensureJsonArray(row.required_fields).map(String),
      optionalFields: ensureJsonArray(row.optional_fields).map(String),
      maxConversationTurns: row.max_conversation_turns,
      autoTransferEnabled: row.auto_transfer_enabled,
      transferConditions: ensureJsonObject(row.transfer_conditions),
      fallbackMessage: row.fallback_message,
      systemInstructions: row.system_instructions,
      doInstructions: ensureJsonArray(row.do_instructions).map(String),
      dontInstructions: ensureJsonArray(row.dont_instructions).map(String),
      faqEnabled: row.faq_enabled,
      customKnowledge: row.custom_knowledge,
      autoCreateLead: row.auto_create_lead,
      autoScheduleAppointment: row.auto_schedule_appointment,
      autoSendConfirmation: row.auto_send_confirmation,
      sentimentAnalysisEnabled: row.sentiment_analysis_enabled,
      language: row.language,
      voiceId: row.voice_id,
      speechRate: row.speech_rate != null ? parseFloat(row.speech_rate) : 1.0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to PromptTemplate
   */
  private mapToPromptTemplate(row: any): PromptTemplate {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      templateType: row.template_type,
      templateContent: row.template_content,
      variables: row.variables || {},
      isActive: row.is_active,
      priority: row.priority,
    };
  }

  /**
   * Map database row to ConversationScenario
   */
  private mapToScenario(row: any): ConversationScenario {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      triggerKeywords: row.trigger_keywords || [],
      customGreeting: row.custom_greeting,
      customQuestions: row.custom_questions || [],
      customResponses: row.custom_responses || {},
      actions: row.actions || [],
      isActive: row.is_active,
      priority: row.priority,
    };
  }
}

export const aiConfigService = new AIConfigService();


import type { AIAgentConfig } from './ai-config.service.js';
import { ensureJsonArray } from '../db/pg-values.js';

/** Legacy UI voice ids → Realtime-compatible ids (live calls) */
const VOICE_ID_ALIASES: Record<string, string> = {
  nova: 'shimmer',
  echo: 'ash',
  onyx: 'cedar',
  sarah: 'coral',
  emma: 'shimmer',
  marcus: 'ash',
  james: 'cedar',
  alex: 'ash',
};

function normalizeVoiceId(voice: string | undefined): string | undefined {
  if (!voice) return undefined;
  const key = voice.trim().toLowerCase();
  return VOICE_ID_ALIASES[key] || key;
}

export interface DashboardAIConfig {
  agentName: string;
  greetingMessage: string;
  transferPhoneNumber: string;
  voice: string;
  language: string;
  tone: string;
  customInstructions: string;
  doRules: string[];
  dontRules: string[];
  businessDescription?: string;
  servicesOffered?: string[];
  businessHoursDescription?: string;
  capabilities: {
    bookAppointments: boolean;
    transferCalls: boolean;
    collectPayments: boolean;
    sendSMS: boolean;
    accessKnowledge: boolean;
  };
}

const DEFAULT_CAPABILITIES: DashboardAIConfig['capabilities'] = {
  bookAppointments: true,
  transferCalls: true,
  collectPayments: false,
  sendSMS: true,
  accessKnowledge: true,
};

/** Ensure dashboard always receives a complete, safe config object */
export function normalizeDashboardConfig(
  partial: Partial<DashboardAIConfig> | Record<string, unknown>
): DashboardAIConfig {
  const p = partial as Record<string, unknown>;
  const caps = (p.capabilities && typeof p.capabilities === 'object'
    ? p.capabilities
    : {}) as Partial<DashboardAIConfig['capabilities']>;
  return {
    agentName: String(p.agentName ?? p.agent_name ?? 'Sarah'),
    greetingMessage: String(p.greetingMessage ?? p.greeting_message ?? ''),
    transferPhoneNumber: String(
      p.transferPhoneNumber ?? p.transfer_phone_number ?? ''
    ),
    voice: normalizeVoiceId(String(p.voice ?? p.voiceId ?? p.voice_id ?? 'marin')) || 'marin',
    language: String(p.language ?? 'en'),
    tone:
      String(p.tone ?? 'professional')
        .toLowerCase()
        .split(/[,\s]/)[0] || 'professional',
    customInstructions: String(
      p.customInstructions ?? p.systemInstructions ?? p.system_instructions ?? ''
    ),
    doRules: Array.isArray(p.doRules)
      ? p.doRules.map(String)
      : Array.isArray(p.doInstructions)
        ? p.doInstructions.map(String)
        : [],
    dontRules: Array.isArray(p.dontRules)
      ? p.dontRules.map(String)
      : Array.isArray(p.dontInstructions)
        ? p.dontInstructions.map(String)
        : [],
    businessDescription: String(p.businessDescription ?? p.business_description ?? ''),
    servicesOffered: Array.isArray(p.servicesOffered)
      ? p.servicesOffered.map(String)
      : Array.isArray(p.services_offered)
        ? (p.services_offered as unknown[]).map(String)
        : [],
    businessHoursDescription: String(
      p.businessHoursDescription ?? p.business_hours_description ?? ''
    ),
    capabilities: { ...DEFAULT_CAPABILITIES, ...caps },
  };
}

export function toDashboardConfig(config: AIAgentConfig): DashboardAIConfig {
  const extended = config as AIAgentConfig & {
    metadata?: { capabilities?: DashboardAIConfig['capabilities'] };
    transferPhoneNumber?: string;
  };
  const meta = extended.metadata;
  return normalizeDashboardConfig({
    agentName: config.agentName || 'Sarah',
    greetingMessage: config.greetingMessage || '',
    transferPhoneNumber: extended.transferPhoneNumber || '',
    voice: config.voiceId || 'coral',
    language: config.language || 'en',
    tone: config.tone || 'professional',
    customInstructions: config.systemInstructions || '',
    doRules: config.doInstructions || [],
    dontRules: config.dontInstructions || [],
    businessDescription: config.businessDescription || '',
    servicesOffered: config.servicesOffered || [],
    businessHoursDescription: config.businessHoursDescription || '',
    capabilities: meta?.capabilities || capabilitiesFromFlags(config),
  });
}

function capabilitiesFromFlags(config: AIAgentConfig): DashboardAIConfig['capabilities'] {
  return {
    bookAppointments: config.autoScheduleAppointment ?? true,
    transferCalls: config.autoTransferEnabled ?? true,
    collectPayments: false,
    sendSMS: config.autoSendConfirmation ?? true,
    accessKnowledge: config.faqEnabled ?? true,
  };
}

export function fromDashboardBody(body: Record<string, unknown>): Partial<AIAgentConfig> & {
  capabilities?: DashboardAIConfig['capabilities'];
} {
  const caps = body.capabilities as DashboardAIConfig['capabilities'] | undefined;

  const tone = (body.tone as string) || 'professional';
  const agentName =
    (body.agentName as string) ||
    (body.agent_name as string) ||
    undefined;
  const greetingMessage =
    (body.greetingMessage as string) ||
    (body.greeting_message as string) ||
    undefined;

  const transferPhoneNumber =
    (body.transferPhoneNumber as string) ||
    (body.transfer_phone_number as string) ||
    undefined;

  return {
    agentName,
    greetingMessage,
    transferPhoneNumber,
    voiceId: normalizeVoiceId((body.voice as string) || (body.voiceId as string)),
    language: body.language as string,
    tone,
    personality: (body.personality as string) || tone,
    systemInstructions:
      (body.customInstructions as string) ||
      (body.systemInstructions as string) ||
      (body.system_instructions as string),
    doInstructions: ensureJsonArray(
      body.doRules ?? body.doInstructions ?? body.do_instructions
    ).map(String),
    dontInstructions: ensureJsonArray(
      body.dontRules ?? body.dontInstructions ?? body.dont_instructions
    ).map(String),
    businessDescription:
      (body.businessDescription as string) ||
      (body.business_description as string) ||
      undefined,
    servicesOffered: ensureJsonArray(
      body.servicesOffered ?? body.services_offered
    ).map(String),
    businessHoursDescription:
      (body.businessHoursDescription as string) ||
      (body.business_hours_description as string) ||
      undefined,
    autoScheduleAppointment: caps?.bookAppointments,
    autoTransferEnabled: caps?.transferCalls,
    autoSendConfirmation: caps?.sendSMS,
    faqEnabled: caps?.accessKnowledge,
    autoCreateLead: true,
    capabilities: caps,
  };
}

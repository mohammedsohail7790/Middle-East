/**
 * Centralized Plan Configuration — Single Source of Truth
 * 
 * ALL systems MUST reference this config:
 * - dashboard UI
 * - backend APIs
 * - realtime gateway
 * - billing system
 * - voice routing
 * - integrations
 * - analytics
 * - onboarding
 * - webhooks
 * 
 * Backend enforcement is mandatory. UI-only enforcement is NOT acceptable.
 */

// ─── Supported Languages ────────────────────────────────────────────────────

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Mandarin' },
  { code: 'hi', name: 'Hindi' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

// ─── Voice Configuration Types ──────────────────────────────────────────────

export type VoiceProvider = 'openai' | 'elevenlabs' | 'custom';
export type OpenAIVoice =
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'coral'
  | 'echo'
  | 'fable'
  | 'onyx'
  | 'nova'
  | 'sage'
  | 'shimmer'
  | 'verse'
  | 'marin'
  | 'cedar';
export type InterruptionSensitivity = 'low' | 'medium' | 'high';
export type ResponseStyle = 'professional' | 'friendly' | 'casual' | 'formal';

export interface TenantVoiceSettings {
  voiceProvider: VoiceProvider;
  voiceId: string;
  language: LanguageCode;
  speakingSpeed: number;
  interruptionSensitivity: InterruptionSensitivity;
  responseStyle: ResponseStyle;
  customPromptTone: string;
}

export const DEFAULT_VOICE_CONFIG: TenantVoiceSettings = {
  voiceProvider: 'openai',
  voiceId: 'marin',
  language: 'en',
  speakingSpeed: 1.0,
  interruptionSensitivity: 'high',
  responseStyle: 'professional',
  customPromptTone: 'warm_friendly_human',
};

// ─── Plan Feature Definitions ───────────────────────────────────────────────

export interface PlanConfig {
  includedMinutes: number;
  overageRate: number;
  maxPhoneNumbers: number;
  languages: LanguageCode[];
  customVoice: boolean;
  crmIntegrations: boolean;
  advancedAnalytics: boolean;
  apiAccess: boolean;
  hipaa: boolean;
  calendarSync: 'basic' | 'native' | 'custom';
  voiceCloning: boolean;
  multiLanguageSwitching: boolean;
  dynamicVoiceRouting: boolean;
  departmentVoices: boolean;
  sla: boolean;
  dedicatedOnboarding: boolean;
  maxKnowledgeFiles: number;
  maxKnowledgeSizeMb: number;
}

export const PLAN_FEATURES: Record<string, PlanConfig> = {
  essential: {
    includedMinutes: 250,
    overageRate: 0.20,
    maxPhoneNumbers: 1,
    languages: ['en', 'es'],
    customVoice: false,
    crmIntegrations: false,
    advancedAnalytics: false,
    apiAccess: false,
    hipaa: false,
    calendarSync: 'basic',
    voiceCloning: false,
    multiLanguageSwitching: false,
    dynamicVoiceRouting: false,
    departmentVoices: false,
    sla: false,
    dedicatedOnboarding: false,
    maxKnowledgeFiles: 5,
    maxKnowledgeSizeMb: 10,
  },
  professional: {
    includedMinutes: 750,
    overageRate: 0.15,
    maxPhoneNumbers: 3,
    languages: ['en', 'es', 'fr', 'ru', 'zh', 'hi'],
    customVoice: true,
    crmIntegrations: true,
    advancedAnalytics: true,
    apiAccess: false,
    hipaa: false,
    calendarSync: 'native',
    voiceCloning: false,
    multiLanguageSwitching: false,
    dynamicVoiceRouting: false,
    departmentVoices: false,
    sla: false,
    dedicatedOnboarding: false,
    maxKnowledgeFiles: 20,
    maxKnowledgeSizeMb: 50,
  },
  trial: {
    // Trial unlocks PROFESSIONAL features
    includedMinutes: 60,
    overageRate: 0,
    maxPhoneNumbers: 3,
    languages: ['en', 'es', 'fr', 'ru', 'zh', 'hi'],
    customVoice: true,
    crmIntegrations: true,
    advancedAnalytics: true,
    apiAccess: false,
    hipaa: false,
    calendarSync: 'native',
    voiceCloning: false,
    multiLanguageSwitching: false,
    dynamicVoiceRouting: false,
    departmentVoices: false,
    sla: false,
    dedicatedOnboarding: false,
    maxKnowledgeFiles: 20,
    maxKnowledgeSizeMb: 50,
  },
};

// ─── Trial Configuration ────────────────────────────────────────────────────

export const TRIAL_CONFIG = {
  durationDays: 14,
  totalMinutesLimit: 60,
  unlocksFeatures: 'professional' as const,
} as const;

// ─── Voice Rules by Plan ────────────────────────────────────────────────────

export const VOICE_RULES = {
  essential: {
    allowedProviders: ['openai'] as VoiceProvider[],
    allowedVoices: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar'] as OpenAIVoice[],
    customCloning: false,
    brandedGreeting: false,
    departmentVoices: false,
  },
  professional: {
    allowedProviders: ['openai', 'elevenlabs'] as VoiceProvider[],
    allowedVoices: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar'] as OpenAIVoice[],
    customCloning: false,
    brandedGreeting: true,
    departmentVoices: false,
  },
  trial: {
    allowedProviders: ['openai', 'elevenlabs'] as VoiceProvider[],
    allowedVoices: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar'] as OpenAIVoice[],
    customCloning: false,
    brandedGreeting: true,
    departmentVoices: false,
  },
} as const;

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Get plan config for a given plan key. Falls back to essential if unknown.
 */
export function getPlanConfig(plan: string): PlanConfig {
  if (plan === 'trialing' || plan === 'trial') {
    return PLAN_FEATURES.trial;
  }
  return PLAN_FEATURES[plan] || PLAN_FEATURES.essential;
}

/**
 * Check if a language is allowed for a given plan.
 */
export function isLanguageAllowed(plan: string, language: LanguageCode): boolean {
  const config = getPlanConfig(plan);
  return config.languages.includes(language);
}

/**
 * Get allowed languages for a plan.
 */
export function getAllowedLanguages(plan: string): LanguageCode[] {
  return getPlanConfig(plan).languages;
}

/**
 * Check if a voice provider is allowed for a given plan.
 */
export function isVoiceProviderAllowed(plan: string, provider: VoiceProvider): boolean {
  const effectivePlan = (plan === 'trialing' || plan === 'trial') ? 'trial' : plan;
  const rules = VOICE_RULES[effectivePlan as keyof typeof VOICE_RULES] || VOICE_RULES.essential;
  return rules.allowedProviders.includes(provider);
}

/**
 * Check if a feature is available for a given plan.
 */
export function isPlanFeatureEnabled(plan: string, feature: keyof PlanConfig): boolean {
  const config = getPlanConfig(plan);
  const value = config[feature];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  return Boolean(value);
}

/**
 * Get the effective plan for trial users (unlocks professional features).
 */
export function getEffectivePlan(plan: string, status: string): string {
  if (status === 'trialing') return 'trial';
  return plan;
}

/**
 * Validate tenant voice configuration against plan limits.
 */
export function validateVoiceConfig(
  plan: string,
  config: Partial<TenantVoiceSettings>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const planConfig = getPlanConfig(plan);
  const effectivePlan = (plan === 'trialing' || plan === 'trial') ? 'trial' : plan;
  const voiceRules = VOICE_RULES[effectivePlan as keyof typeof VOICE_RULES] || VOICE_RULES.essential;

  if (config.language && !planConfig.languages.includes(config.language)) {
    errors.push(`Language '${config.language}' is not available on the ${plan} plan. Available: ${planConfig.languages.join(', ')}`);
  }

  if (config.voiceProvider && !voiceRules.allowedProviders.includes(config.voiceProvider)) {
    errors.push(`Voice provider '${config.voiceProvider}' is not available on the ${plan} plan. Available: ${voiceRules.allowedProviders.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

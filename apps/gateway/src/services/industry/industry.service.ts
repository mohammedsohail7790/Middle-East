/**
 * Industry Service
 * Resolves industry defaults, builds system prompts, and merges tenant overrides.
 */

import { getIndustryTemplate, getAllIndustries, type IndustryTemplate, type LeadField, type IndustryKPI } from './templates.js';

export interface TenantIndustryConfig {
    industry: string;
    systemPrompt: string;
    greeting: string;
    services: string[];
    workingHours: string;
    diagnosticFee: number;
    callHandlingMode: 'message' | 'transfer' | 'both';
    transferMessage: string;
    leadFields: LeadField[];
    kpis: IndustryKPI[];
    industryQuestions: string[];
}

/**
 * Build the full industry config for a tenant.
 * Starts from template defaults, then applies any tenant-provided overrides.
 */
export function buildIndustryConfig(params: {
    industry: string;
    businessName: string;
    overridePrompt?: string;
    overrideGreeting?: string;
    overrideServices?: string[];
    overrideWorkingHours?: string;
    overrideDiagnosticFee?: number;
    overrideCallHandlingMode?: 'message' | 'transfer' | 'both';
    overrideTransferMessage?: string;
}): TenantIndustryConfig {
    const template = getIndustryConfig(params.industry);
    const businessName = params.businessName || '[Business]';

    const systemPrompt = params.overridePrompt || template.systemPrompt;
    const greeting = (params.overrideGreeting || template.greeting).replace(/\[Business\]/g, businessName);
    const services = params.overrideServices ?? template.defaultServices;
    const workingHours = params.overrideWorkingHours ?? template.defaultWorkingHours;
    const diagnosticFee = params.overrideDiagnosticFee ?? template.diagnosticFee;
    const callHandlingMode = params.overrideCallHandlingMode ?? template.callHandlingMode;
    const transferMessage = params.overrideTransferMessage ?? template.transferMessage;

    return {
        industry: params.industry,
        systemPrompt,
        greeting,
        services,
        workingHours,
        diagnosticFee,
        callHandlingMode,
        transferMessage,
        leadFields: template.leadFields,
        kpis: template.kpis,
        industryQuestions: template.industryQuestions,
    };
}

export function getIndustryConfig(industry: string): IndustryTemplate {
    const template = getIndustryTemplate(industry);
    if (!template) {
        throw new Error(`Unknown industry: ${industry}`);
    }
    return template;
}

export function listIndustries(): IndustryTemplate[] {
    return getAllIndustries();
}

/**
 * Build a merged system prompt that injects tenant-specific details
 * into the industry template prompt.
 */
export function buildSystemPrompt(params: {
    industry: string;
    businessName: string;
    workingHours?: string;
    diagnosticFee?: number;
    services?: string[];
    customPrompt?: string;
}): string {
    const template = getIndustryConfig(params.industry);
    let prompt = params.customPrompt || template.systemPrompt;

    prompt = prompt.replace(/\[Business\]/g, params.businessName);

    if (params.workingHours) {
        prompt += `\n\nBusiness hours:\n${params.workingHours}`;
    }

    if (params.diagnosticFee !== undefined && params.diagnosticFee > 0) {
        prompt += `\nDiagnostic/service call fee: $${params.diagnosticFee}`;
    }

    if (params.services && params.services.length > 0) {
        prompt += `\n\nServices offered: ${params.services.join(', ')}`;
    }

    return prompt;
}

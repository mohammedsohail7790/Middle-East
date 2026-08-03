import type { TenantVoiceConfig } from '../voice/ai.service.js';
import {
  buildHumanSpeechAppendix,
  buildReceptionistRoleBlock,
  CALL_CLOSING_RULES,
  EMERGENCY_RECEPTIONIST_RULES,
  formatDefaultGreeting,
  getLanguageDisplayName,
  normalizeGreetingText,
  resolveLanguageCode,
} from './receptionist-voice.js';

/**
 * Build the full system prompt for a tenant's AI agent.
 * Handles AI config overrides, knowledge base injection, and business profile assembly.
 */
export async function buildFullPrompt(
  tenantId: string,
  tenantConfig: TenantVoiceConfig,
  aiConfig?: Awaited<
    ReturnType<typeof import('../ai-config/ai-config.service.js')['aiConfigService']['getConfig']>
  > | null
): Promise<string> {
  let resolvedAiConfig = aiConfig;
  if (resolvedAiConfig === undefined) {
    try {
      const { aiConfigService } = await import('../ai-config/ai-config.service.js');
      resolvedAiConfig = await aiConfigService.getConfig(tenantId);
    } catch {
      resolvedAiConfig = null;
    }
  }

  const language =
    resolvedAiConfig?.language || tenantConfig.defaultLanguage || 'en';
  let prompt = await buildSystemPrompt(tenantConfig, language);

  if (resolvedAiConfig) {

    const { wrapUntrustedBlock } = await import('../../security/prompt-safety.js');

    if (resolvedAiConfig.systemInstructions?.trim()) {
      prompt += `\n\n${wrapUntrustedBlock('TENANT_SYSTEM_INSTRUCTIONS', resolvedAiConfig.systemInstructions)}`;
    }

    if (resolvedAiConfig.doInstructions?.length) {
      prompt += `\n\n${wrapUntrustedBlock('TENANT_DO', resolvedAiConfig.doInstructions.join('. '))}`;
    }
    if (resolvedAiConfig.dontInstructions?.length) {
      prompt += `\n\n${wrapUntrustedBlock('TENANT_DONT', resolvedAiConfig.dontInstructions.join('. '))}`;
    }

    if (resolvedAiConfig.agentName && resolvedAiConfig.agentName !== 'AI Assistant') {
      const name = resolvedAiConfig.agentName.trim();
      prompt = prompt.replace(/You are [^.]+\./, `You are ${name}.`);
      prompt = prompt.replace(new RegExp(`this is \\w+,`, 'i'), `this is ${name},`);
    }

    if (resolvedAiConfig.greetingMessage?.trim()) {
      tenantConfig.welcomeMessage = normalizeGreetingText(
        resolvedAiConfig.greetingMessage
          .replace(/\[Business\]/g, tenantConfig.businessName)
          .replace(/\[Agent\]/g, resolvedAiConfig.agentName || tenantConfig.agentName || 'Sarah')
      );
    }

    if (resolvedAiConfig.tone) {
      prompt += `\n\nSpeak in a ${resolvedAiConfig.tone} tone.`;
    }

    if (resolvedAiConfig.language) {
      const code = resolveLanguageCode(resolvedAiConfig.language);
      if (code !== 'en') {
        const langName = getLanguageDisplayName(code);
        prompt += `\n\nCRITICAL — Language: You MUST speak only ${langName} on this call. Every reply must be in ${langName}. Do not use English unless the caller switches to English first.`;
      }
    }

    const offered = Array.isArray(resolvedAiConfig.servicesOffered)
      ? resolvedAiConfig.servicesOffered.map(String).filter(Boolean)
      : [];
    if (offered.length > 0) {
      tenantConfig.services = offered;
    }

    if (resolvedAiConfig.businessDescription?.trim()) {
      tenantConfig.businessDescription = resolvedAiConfig.businessDescription.trim();
    }
  }

  const { wrapUntrustedBlock } = await import('../../security/prompt-safety.js');

  if (tenantConfig.businessDescription?.trim()) {
    prompt += `\n\n${wrapUntrustedBlock(
      'BUSINESS_PROFILE',
      tenantConfig.businessDescription.trim()
    )}`;
  }

  if (tenantConfig.services.length > 0) {
    prompt += `\n\nServices this business offers (authoritative): ${tenantConfig.services.slice(0, 12).join(', ')}.`;
  }

  if (tenantConfig.industry !== 'hvac') {
    prompt +=
      '\n\nDo NOT describe this business as an HVAC, heating, cooling, or home-services company unless the business profile or caller explicitly says so.';
  }

  // Knowledge base is looked up live via the search_knowledge_base tool (see the
  // "On the call" instructions in buildSystemPrompt) instead of eagerly prefetched
  // here — an eager embeddings search added 600ms+ of latency before every greeting
  // for a generic query that often didn't match what the caller actually asked about.

  return prompt;
}

/**
 * Build the base system prompt (without AI config overrides or knowledge base).
 */
export async function buildSystemPrompt(tenantConfig: TenantVoiceConfig, language = 'en'): Promise<string> {
  const agentName = tenantConfig.agentName || 'Sarah';
  const businessName = tenantConfig.businessName;
  const industry = tenantConfig.industry || 'general';
  const services = tenantConfig.services?.slice(0, 12).join(', ') || 'see business profile';
  const workingHours = tenantConfig.workingHours || 'standard business hours';
  const tone = tenantConfig.tone || 'professional';
  const diagnosticFee = tenantConfig.diagnosticFee ?? 0;
  const isHvac = industry === 'hvac';
  const transferNumber = tenantConfig.transferPhoneNumber;
  const callHandling = tenantConfig.callHandlingMode || 'message';
  const hasGreeting = Boolean(tenantConfig.welcomeMessage?.trim());

  const toneDescriptions: Record<string, string> = {
    professional: "Professional but warm — like a front-desk receptionist at a well-run office",
    friendly: "Friendly and relaxed — like a neighbor who works there",
    warm: "Warm and caring — you genuinely want to help",
    formal: "Clear and respectful — no slang",
    casual: "Easy-going — conversational, not stiff",
  };

  const personalityDesc = toneDescriptions[tone] || toneDescriptions.professional;

  let prompt = buildReceptionistRoleBlock({
    agentName,
    businessName,
    personalityDesc,
    language,
  });

  if (hasGreeting) {
    prompt += `\n\nYour opening greeting is already spoken when the call connects. Do not repeat your introduction or say hello again unless the caller greets you first.`;
  } else {
    prompt += `\n\nWhen you first speak, use something like: "${formatDefaultGreeting(businessName, agentName)}"`;
  }

  const industryLabel =
    tenantConfig.businessDescription?.trim() ||
    (isHvac ? 'HVAC and climate control' : 'the services described in the business profile');
  prompt += `\n\nAbout ${businessName}: ${industryLabel}. Services include ${services}. Hours: ${workingHours}.`;
  if (diagnosticFee > 0) {
    prompt += ` Call-out / diagnostic fee: $${diagnosticFee} (often waived if they proceed with the repair). You must proactively disclose this fee before booking or confirming a visit — do not wait to be asked, and don't skip it even if the call feels rushed. Say it naturally in your own words, worked into the conversation however fits best; don't recite a fixed script — the only requirement is that the caller clearly hears the dollar amount and that it's often waived if they go ahead with the repair.`;
  }

  if (tenantConfig.customSystemPrompt?.trim()) {
    const cleaned = tenantConfig.customSystemPrompt
      .trim()
      .replace(/\bAI\s+(voice\s+)?(assistant|receptionist)\b/gi, 'receptionist');
    prompt += `\n\n${cleaned}`;
  }

  prompt += `\n\n${EMERGENCY_RECEPTIONIST_RULES}`;
  prompt += `\n\n${CALL_CLOSING_RULES}`;
  prompt += `\n\n${buildHumanSpeechAppendix()}`;

  if (callHandling === 'transfer' && transferNumber) {
    prompt += `\n\nTransfer rules:
- If someone asks for a person, say "Sure, one moment" and use transfer_call
- You can transfer if the issue is complex`;
  } else if (callHandling === 'both' && transferNumber) {
    prompt += `\n\nTransfer rules:
- For non-emergency human requests, try to help first; transfer if they insist
- Use transfer_call when they need a live person`;
  } else if (transferNumber) {
    prompt += `\n\nFor non-emergency requests to speak to someone: take name and callback; offer transfer only if they insist you have transfer_call.`;
  } else {
    prompt += `\n\nMessage taking:
- If someone wants a person, take name, phone, and issue — promise a callback`;
  }

  let isAfterHours = false;
  try {
    const { businessHoursService } = await import('../business-hours/business-hours.service.js');
    const currentlyOpen = await businessHoursService.isCurrentlyOpen(tenantConfig.tenantId);
    isAfterHours = !currentlyOpen;
  } catch { /* business hours not available — treat as open */ }

  if (isAfterHours) {
    prompt += `\n\nIMPORTANT — It's currently after business hours. Let the caller know that the office is closed right now but you can still help them. Take their info and let them know someone will call back during business hours. Be extra helpful since they're calling outside normal hours.`;
  }

  prompt += `\n\nLanguage: Default to natural New York English. If the caller uses Arabic (Gulf), Spanish, French, Hindi, or Mandarin, match them; otherwise stay in NY English.`;

  prompt += `\n\nOn the call: Bookings — collect name, phone, issue, and time one at a time, then use scheduling tools. Phone number — digits are easy to mishear over the phone, so read the full number back once before you submit anything and let them correct it; phrase it however feels natural in the moment (digit by digit, in pairs, whatever's clearest), there's no fixed script. Email — always ask for the caller's email (for leads and bookings alike) so confirmations, reschedule notices, and reminders reach them; email addresses are easy to mishear too, so read it back once in your own words and let them correct it before you submit anything — only proceed without one if they decline. Service address — for any job, visit, quote, or on-site service, always ask for the full service address (street and city); the business needs to know where the work is. Read it back once to confirm before submitting. Reschedules — use reschedule_appointment with phone or appointment id plus new_time in ISO format; confirm the new slot aloud. Cancellations — use cancel_appointment when they want to cancel. After any change, confirm details and close warmly (see call-ending rules). Uncertain answers — use search_knowledge_base before guessing. Stay brief; this is voice, not email.`;

  const area = tenantConfig.serviceArea;
  if (area?.enabled) {
    const limitDesc =
      area.mode === 'minutes'
        ? `within about ${area.limit} minutes' drive of the shop`
        : `within about ${area.limit} miles of the shop`;
    prompt += `\n\nService area: ${businessName} only serves customers ${limitDesc}. After you've confirmed the caller's service address, call check_service_area with it BEFORE booking any on-site visit. If the result says the address is in the area, proceed normally. If it's out of the area, kindly let them know it's outside the area the team covers — do not book an on-site visit — but still capture their name, phone, and address as a lead so the business can follow up. If the check can't verify the address, book normally and note that the team will confirm coverage.`;
  }

  return prompt;
}

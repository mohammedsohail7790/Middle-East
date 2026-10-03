import { describe, it, expect } from 'vitest';
import {
  fromKlarosWorkforceInput,
  toKlarosWorkforceOutput,
} from '../../../apps/gateway/src/services/klaros/klaros.controller.js';

describe('Klaros <-> ai_agent_configs field mapping', () => {
  it('maps Klaros business-context fields onto ai_agent_configs field names', () => {
    const update = fromKlarosWorkforceInput({
      businessDescription: 'A plumbing company',
      services: ['drain cleaning'],
      markets: ['Austin'],
      qualificationQuestions: ['What is the issue?'],
      requiredCustomerInformation: ['name', 'phone'],
      transferConditions: { emergency: true },
      operatingInstructions: 'Be concise.',
      tone: 'professional',
      personality: 'friendly',
    });

    expect(update).toEqual({
      businessDescription: 'A plumbing company',
      servicesOffered: ['drain cleaning'],
      serviceAreas: ['Austin'],
      qualificationQuestions: ['What is the issue?'],
      requiredFields: ['name', 'phone'],
      transferConditions: { emergency: true },
      systemInstructions: 'Be concise.',
      tone: 'professional',
      personality: 'friendly',
    });
  });

  it('ignores unknown/malformed fields rather than passing them through', () => {
    const update = fromKlarosWorkforceInput({
      businessDescription: 123, // wrong type — ignored
      services: 'not-an-array', // wrong type — ignored
      randomField: 'should not appear',
    });
    expect(update).toEqual({});
  });

  it('ignores an empty body entirely', () => {
    expect(fromKlarosWorkforceInput({})).toEqual({});
    expect(fromKlarosWorkforceInput(undefined)).toEqual({});
  });

  it('maps a real ai_agent_configs shape to the Klaros output contract', () => {
    const config = {
      businessDescription: 'A plumbing company',
      servicesOffered: ['drain cleaning'],
      serviceAreas: ['Austin'],
      qualificationQuestions: ['What is the issue?'],
      requiredFields: ['name', 'phone'],
      transferConditions: { emergency: true },
      systemInstructions: 'Be concise.',
      tone: 'professional',
      personality: 'friendly',
      agentName: 'Halla Front Desk',
      updatedAt: new Date('2025-01-01'),
    } as any;

    expect(toKlarosWorkforceOutput(config)).toEqual({
      businessDescription: 'A plumbing company',
      services: ['drain cleaning'],
      markets: ['Austin'],
      qualificationQuestions: ['What is the issue?'],
      requiredCustomerInformation: ['name', 'phone'],
      transferConditions: { emergency: true },
      operatingInstructions: 'Be concise.',
      tone: 'professional',
      personality: 'friendly',
      agentName: 'Halla Front Desk',
      updatedAt: config.updatedAt,
    });
  });

  it('defaults a missing businessDescription to null rather than undefined', () => {
    const config = {
      servicesOffered: [],
      serviceAreas: [],
      qualificationQuestions: [],
      requiredFields: [],
      transferConditions: undefined,
      tone: 'neutral',
      personality: 'neutral',
      agentName: 'Agent',
      updatedAt: new Date(),
    } as any;
    expect(toKlarosWorkforceOutput(config).businessDescription).toBeNull();
    expect(toKlarosWorkforceOutput(config).transferConditions).toEqual({});
  });
});

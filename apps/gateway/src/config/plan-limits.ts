/** Plan limits for phones and specialized AI agents */
export function getMaxPhoneNumbers(plan: string, status?: string): number {
  if (status === 'trialing') return 3;
  switch (plan) {
    case 'professional':
      return 3;
    case 'essential':
    case 'starter':
    default:
      return 1;
  }
}

export function getMaxAiAgents(plan: string, status?: string): number {
  if (status === 'trialing') return 3;
  switch (plan) {
    case 'professional':
      return 3;
    case 'essential':
    case 'starter':
    default:
      return 1;
  }
}

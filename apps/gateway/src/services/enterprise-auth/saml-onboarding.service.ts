import { ssoService } from '../sso/sso.service.js';

export type IdpPreset = 'google_workspace' | 'microsoft_entra' | 'generic_saml';

const PRESETS: Record<IdpPreset, { provider: string; attributeMapping: Record<string, string> }> = {
  google_workspace: {
    provider: 'google',
    attributeMapping: { email: 'email', name: 'displayName' },
  },
  microsoft_entra: {
    provider: 'azure',
    attributeMapping: { email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress' },
  },
  generic_saml: {
    provider: 'saml',
    attributeMapping: { email: 'email' },
  },
};

export function getSamlOnboardingGuide(tenantId: string, preset: IdpPreset = 'generic_saml') {
  const base = process.env.PUBLIC_GATEWAY_URL || process.env.GATEWAY_URL || 'https://gateway.hallaai.com';
  const p = PRESETS[preset];
  return {
    tenantId,
    preset,
    provider: p.provider,
    steps: [
      'Create SAML app in your IdP (Google Admin or Entra Enterprise Applications)',
      `Set ACS URL: ${base}/api/v1/sso/acs`,
      `Set Entity ID: halla-ai-${tenantId}`,
      'Upload IdP certificate to Halla AI SSO settings',
      'Enable SSO in Security → Org auth policy',
    ],
    metadataUrl: `${base}/api/v1/enterprise-auth/saml/metadata?tenantId=${tenantId}`,
    attributeMapping: p.attributeMapping,
  };
}

export async function getSamlMetadata(tenantId: string) {
  const config = await ssoService.getConfig(tenantId);
  const base = process.env.PUBLIC_GATEWAY_URL || 'https://gateway.hallaai.com';
  return {
    tenantId,
    entityId: config?.entityId || `halla-ai-${tenantId}`,
    acsUrl: `${base}/api/v1/sso/acs`,
    configured: !!config?.enabled,
    provider: config?.provider || null,
  };
}

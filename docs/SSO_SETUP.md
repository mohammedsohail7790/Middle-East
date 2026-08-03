# Enterprise SSO Setup

Call IQ supports org-scoped SAML SSO (Google Workspace, Microsoft Entra ID) via existing `sso` service.

## Gateway configuration

Set environment variables per tenant IdP (see `apps/gateway/src/services/sso/`).

## Dashboard

1. **Security** (`/dashboard/security`) — MFA/SSO required flags, IP allowlist, session revoke.
2. `GET /api/v1/enterprise-auth/sso` — read current SSO metadata.
3. `PUT /api/v1/enterprise-auth/policy` — org auth policy.

## SCIM provisioning

`POST /api/v1/enterprise-auth/scim/users` — upsert directory users (external IdP sync).

## Audit

Auth policy changes and session revocations write to `enterprise_audit_events`.

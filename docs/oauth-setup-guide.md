# Google & Microsoft OAuth Setup Guide

## Overview

Call IQ uses Supabase Auth for OAuth. The login/signup pages already have Google and Microsoft buttons — you just need to configure the providers in your Supabase project.

---

## Google OAuth Setup

### 1. Create Google OAuth App

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth client ID**
5. Application type: **Web application**
6. Name: `Call IQ Production`
7. Add Authorized redirect URIs:
   ```
   https://<your-supabase-project>.supabase.co/auth/v1/callback
   ```
8. Copy the **Client ID** and **Client Secret**

### 2. Enable in Supabase

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Navigate to **Authentication → Providers → Google**
3. Toggle **Enable Google provider**
4. Paste your **Client ID** and **Client Secret**
5. Click **Save**

### 3. Add to Environment (if self-hosting)

```env
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=your-client-id
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=your-client-secret
SUPABASE_AUTH_EXTERNAL_GOOGLE_REDIRECT_URI=https://<your-supabase>.supabase.co/auth/v1/callback
```

---

## Microsoft (Azure AD) OAuth Setup

### 1. Register Azure App

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory → App registrations**
3. Click **New registration**
4. Name: `Call IQ`
5. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
6. Redirect URI: **Web** → `https://<your-supabase>.supabase.co/auth/v1/callback`
7. Click **Register**
8. Copy the **Application (client) ID**
9. Go to **Certificates & secrets → New client secret**
10. Copy the secret **Value** (not the ID)

### 2. Enable in Supabase

1. Navigate to **Authentication → Providers → Azure**
2. Toggle **Enable Azure provider**
3. Paste your **Azure Application ID** and **Secret Value**
4. Set **Azure Tenant** to `common` (for multi-tenant)
5. Click **Save**

---

## Testing OAuth

After setup, test by:

1. Opening `https://app.hallaai.com/login`
2. Clicking "Continue with Google" or "Continue with Microsoft"
3. Completing the OAuth flow
4. Verifying redirect back to `/dashboard`

---

## Notes

- The redirect URI in your OAuth app must **exactly match** what Supabase expects
- For production: `https://<project-ref>.supabase.co/auth/v1/callback`
- Test with a fresh incognito window to avoid cached auth state
- First-time OAuth users will be redirected to `/onboarding` to complete their profile

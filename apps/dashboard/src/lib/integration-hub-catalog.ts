/**
 * Integration Hub catalog — single source of truth for the dashboard.
 * Adding a new integration means adding one entry here; the wizard and
 * categorized grid render entirely from this metadata.
 */

export type IntegrationCategory =
  | "crm"
  | "calendar"
  | "field_service"
  | "property_management"
  | "communication"
  | "automation";

export type IntegrationAuthType = "oauth" | "api_credentials";

export type IntegrationField = {
  key: string;
  label: string;
  type: "text" | "password" | "select" | "url";
  placeholder: string;
  helpTitle?: string;
  helpBody?: string;
  options?: { value: string; label: string }[];
  /** Shown as a copy-to-clipboard hint below the input */
  example?: string;
};

export type IntegrationDef = {
  id: string;
  name: string;
  category: IntegrationCategory;
  tagline: string;
  /** oauth = Connect with login; api_credentials = guided credential paste */
  authType: IntegrationAuthType;
  /** True only for Zapier — surfaced as "Advanced" rather than primary onboarding */
  isAdvanced: boolean;
  /** False = framework-ready "Coming soon" (credentials saved, sync/test pending) */
  ready: boolean;
  planRequired: string | null;
  /** Gateway OAuth path (api.getOAuthRedirectUrl) */
  oauthAuthPath?: string;
  /** Opens the provider's admin/settings page in a new tab (may include {subdomain} placeholders) */
  settingsUrl?: string;
  /** Sign-in page used when settingsUrl needs a tenant subdomain that is not entered yet */
  loginUrl?: string;
  /** Credential fields collected in the wizard */
  fields?: IntegrationField[];
  /** Ordered list of image URLs shown in the screenshot carousel */
  screenshots?: string[];
  /** Step-by-step text guide (collapsible) */
  helpSteps?: string[];
  helpTitle?: string;
  helpBody?: string;
  /** YouTube, Loom, or direct video URL shown as a play-button embed */
  videoUrl?: string;
  /** Vendor-side requirement shown when connect/test fails (plan tier, admin approval, etc.) */
  vendorRequirement?: string;
  /** Optional paste-credentials path when OAuth consent fails (Zoho Self Client, etc.) */
  alternateCredentialFields?: IntegrationField[];
  alternateCredentialLabel?: string;
  /** True = Zapier is the only supported connection path — hides the "Advanced: connect with API key" fallback. */
  zapierOnly?: boolean;
};

const ZOHO_DATA_CENTER_FIELD: IntegrationField = {
  key: "dataCenter",
  label: "Data center",
  type: "select",
  placeholder: "Select your Zoho data center",
  options: [
    { value: "com", label: "United States (.com)" },
    { value: "eu", label: "Europe (.eu)" },
    { value: "in", label: "India (.in)" },
    { value: "com.au", label: "Australia (.com.au)" },
    { value: "jp", label: "Japan (.jp)" },
  ],
  helpTitle: "Which data center?",
  helpBody: "Use the same region as your Zoho CRM login URL (e.g. crm.zoho.eu → Europe).",
};

export const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  crm: "CRM Platforms",
  calendar: "Calendars & Scheduling",
  field_service: "Field Service",
  property_management: "Property Management",
  communication: "Communication",
  automation: "Advanced Automation",
};

export const OAUTH_AUTH_PATHS: Record<string, string> = {
  hubspot: "/integrations/hubspot/auth-url",
  zoho: "/integrations/zoho/auth-url",
  copper: "/integrations/copper/auth-url",
  clio: "/integrations/clio/auth-url",
  slack: "/integrations/slack/auth-url",
  "google-calendar": "/calendar/google/auth-url",
  outlook: "/calendar/outlook/auth-url",
  calendly: "/calendar/calendly/auth-url",
  acuity: "/calendar/acuity/auth-url",
  "square-appointments": "/calendar/square-appointments/auth-url",
  jobber: "/integrations/jobber/auth-url",
};

/** Disconnect via calendar API (provider slug on gateway). */
export const CALENDAR_DISCONNECT_SLUG: Record<string, string> = {
  "google-calendar": "google",
  outlook: "outlook",
  calendly: "calendly",
  acuity: "acuity",
  "square-appointments": "square-appointments",
};

/** Setup guide SVG paths for guided (API key) integrations. */
function guidedScreenshots(integrationId: string, stepCount: number): string[] {
  return Array.from(
    { length: stepCount },
    (_, i) => `/screenshots/${integrationId}/step-${String(i + 1).padStart(2, "0")}.svg`
  );
}

export const ALL_INTEGRATION_DEFS: IntegrationDef[] = [
  // ───────────────────────── CRM Platforms ─────────────────────────
  {
    id: "hubspot",
    name: "HubSpot",
    category: "crm",
    tagline: "Sales CRM & marketing",
    authType: "oauth",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    vendorRequirement:
      "You need a HubSpot account with permission to authorize apps. In your HubSpot developer app → Auth → Scopes, enable exactly these as Required: contacts.read, contacts.write, deals.read, deals.write, contracts.read — nothing else is required unless Halla AI requests it.",
    oauthAuthPath: OAUTH_AUTH_PATHS.hubspot,
  },

  {
    id: "salesforce",
    name: "Salesforce",
    category: "crm",
    tagline: "Enterprise CRM & sales cloud",
    authType: "api_credentials",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    zapierOnly: true,
    vendorRequirement:
      "Connect Salesforce through Zapier — create a Zap with Halla AI as the trigger and Salesforce as the action.",
  },


  {
    id: "zoho",
    name: "Zoho CRM",
    category: "crm",
    tagline: "Leads, contacts & accounts",
    authType: "oauth",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    vendorRequirement:
      "Sign in with a Zoho CRM Administrator who can access Leads. If OAuth shows “don't have access to CRM”, use refresh token connect instead (Self Client in Zoho API Console).",
    oauthAuthPath: OAUTH_AUTH_PATHS.zoho,
    loginUrl: "https://accounts.zoho.com/signin",
    settingsUrl: "https://api-console.zoho.com/",
    screenshots: guidedScreenshots("zoho", 4),
    fields: [ZOHO_DATA_CENTER_FIELD],
    alternateCredentialLabel: "Connect with refresh token instead",
    alternateCredentialFields: [
      ZOHO_DATA_CENTER_FIELD,
      {
        key: "clientId",
        label: "Client ID",
        type: "text",
        placeholder: "From your Zoho Server-based Application",
        helpTitle: "Your Zoho OAuth client",
        helpBody:
          "In api-console.zoho.com create a Server-based Application (same region as CRM). Copy Client ID and Client Secret from that app — not Halla AI's shared credentials.",
      },
      {
        key: "clientSecret",
        label: "Client Secret",
        type: "password",
        placeholder: "Client secret from the same Zoho app",
      },
      {
        key: "refreshToken",
        label: "Refresh token",
        type: "password",
        placeholder: "Long-lived token from Self Client → Generate Code",
        helpTitle: "Generate with Self Client",
        helpBody:
          "Open your app → Self Client → Generate Code. Scopes: ZohoCRM.modules.leads.CREATE,ZohoCRM.modules.leads.READ,ZohoCRM.users.READ. Exchange the code for a refresh token, then paste it here. Must be generated while logged in as your CRM admin.",
      },
    ],
    helpSteps: [
      "Confirm you can open Zoho CRM (crm.zoho.com or your region) as an admin",
      "Select your data center, then Connect — or use refresh token if OAuth is blocked",
      "Approve lead permissions (OAuth) or paste Client ID, Secret, and refresh token",
      "Send a test lead from Halla AI to confirm sync",
    ],
  },
  {
    id: "copper",
    name: "Copper",
    category: "crm",
    tagline: "Google Workspace CRM",
    authType: "api_credentials",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    zapierOnly: true,
    vendorRequirement:
      "Connect Copper through Zapier — create a Zap with Halla AI as the trigger and Copper as the action.",
    loginUrl: "https://app.copper.com/",
  },
  {
    id: "followupboss",
    name: "Follow Up Boss",
    category: "crm",
    tagline: "Real estate CRM",
    authType: "api_credentials",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    zapierOnly: true,
    vendorRequirement:
      "Generate an API key from Admin → API. Your Follow Up Boss account must be active with API access enabled.",
    loginUrl: "https://app.followupboss.com/",
    screenshots: guidedScreenshots("followupboss", 5),
    fields: [
      {
        key: "apiKey",
        label: "API key",
        type: "password",
        placeholder: "Paste your Follow Up Boss API key",
        helpTitle: "Where to find your API key",
        helpBody:
          "In Follow Up Boss: click Admin in the top navigation → API. Click 'Generate API Key', give it a name like 'Halla AI', then copy the key that appears. The button above opens that page directly.",
      },
    ],
    helpSteps: [
      "Sign in to Follow Up Boss using the button above",
      "Go to Admin → API",
      "Click Create API Key and name it Halla AI",
      "Copy the key immediately — you only see it once",
      "Paste below and click Connect",
    ],
  },
  {
    id: "clio",
    name: "Clio",
    category: "crm",
    tagline: "Legal practice management",
    authType: "oauth",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    vendorRequirement:
      "Your Clio firm must allow API access for your plan. When you connect, sign in with the Clio user who should own new contacts.",
    oauthAuthPath: OAUTH_AUTH_PATHS.clio,
    loginUrl: "https://account.clio.com/login",
    screenshots: guidedScreenshots("clio", 3),
    helpSteps: [
      "Click Connect with Clio",
      "Sign in to Clio and approve Halla AI",
      "After redirect, send a test contact to confirm sync",
    ],
  },
  {
    id: "mycase",
    name: "MyCase",
    category: "crm",
    tagline: "Legal case management",
    authType: "api_credentials",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    zapierOnly: true,
    vendorRequirement:
      "Request API access from MyCase before connecting. You will receive a bearer token after your app is approved.",
    loginUrl: "https://www.mycase.com/login/",
    settingsUrl: "https://www.mycase.com/login/",
    screenshots: guidedScreenshots("mycase", 3),
    fields: [
      {
        key: "apiKey",
        label: "Connection code",
        type: "password",
        placeholder: "Paste your MyCase access token",
        helpTitle: "MyCase access token",
        helpBody: "Request API access from MyCase, authorize your app, then paste the bearer token here.",
      },
    ],
    helpSteps: [
      "Request API access from your MyCase account representative",
      "Authorize your developer app and copy the access token",
      "Paste it here and click Connect",
    ],
  },

  // ─────────────────────── Calendars & Scheduling ───────────────────────
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "calendar",
    tagline: "Book appointments during calls",
    authType: "oauth",
    isAdvanced: false,
    ready: true,
    planRequired: null,
    vendorRequirement:
      "Sign in with the Google account whose calendar Halla AI should read and book. Calendar permissions are granted during OAuth.",
    oauthAuthPath: OAUTH_AUTH_PATHS["google-calendar"],
  },
  {
    id: "outlook",
    name: "Outlook Calendar",
    category: "calendar",
    tagline: "Sync with Microsoft Outlook",
    authType: "oauth",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    vendorRequirement:
      "Sign in with the Microsoft 365 work or school account that owns the calendar you want to sync.",
    oauthAuthPath: OAUTH_AUTH_PATHS.outlook,
  },
  {
    id: "calendly",
    name: "Calendly",
    category: "calendar",
    tagline: "Import bookings & scheduling links",
    authType: "oauth",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    vendorRequirement:
      "Sign in with your Calendly account. Some scheduling API features require a paid Calendly plan.",
    oauthAuthPath: OAUTH_AUTH_PATHS.calendly,
  },
  {
    id: "acuity",
    name: "Acuity Scheduling",
    category: "calendar",
    tagline: "Online appointment booking",
    authType: "oauth",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    vendorRequirement:
      "Sign in with your Acuity Scheduling account. An eligible Acuity plan with API access is required.",
    oauthAuthPath: OAUTH_AUTH_PATHS.acuity,
    loginUrl: "https://secure.acuityscheduling.com/login.php",
    screenshots: guidedScreenshots("acuity", 4),
    helpSteps: [
      "Click Connect with Acuity Scheduling",
      "Sign in to Acuity and approve Halla AI",
      "After redirect, verify your calendar connection",
    ],
  },
  {
    id: "setmore",
    name: "Setmore",
    category: "calendar",
    tagline: "Free online scheduling",
    authType: "api_credentials",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    zapierOnly: true,
    vendorRequirement:
      "Developer API keys may require applying at setmore.com/developers before keys are issued.",
    loginUrl: "https://my.setmore.com/",
    settingsUrl: "https://www.setmore.com/developers",
    screenshots: guidedScreenshots("setmore", 3),
    fields: [
      {
        key: "apiKey",
        label: "Developer API key",
        type: "password",
        placeholder: "Setmore API key",
        helpTitle: "Developer API key",
        helpBody: "In Setmore go to Settings → Developer API and generate a key.",
      },
    ],
    helpSteps: [
      "Click 'Sign in to Setmore' to open your account",
      "Request API access at setmore.com/developers if you do not have a key yet",
      "Paste your API key",
      "Click Verify Connection",
    ],
  },
  {
    id: "square-appointments",
    name: "Square Appointments",
    category: "calendar",
    tagline: "Scheduling & point of sale",
    authType: "oauth",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    vendorRequirement:
      "Sign in with your Square account. Your Square seller account must have Appointments enabled.",
    oauthAuthPath: OAUTH_AUTH_PATHS["square-appointments"],
    loginUrl: "https://squareup.com/login",
    helpSteps: [
      "Click Connect with Square Appointments",
      "Sign in to Square and approve Halla AI",
      "After redirect, verify your calendar connection",
    ],
  },
  {
    id: "vagaro",
    name: "Vagaro",
    category: "calendar",
    tagline: "Salon & wellness booking",
    authType: "api_credentials",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    zapierOnly: true,
    vendorRequirement:
      "Vagaro API access is granted by Vagaro support on request — contact them before connecting.",
    settingsUrl: "https://www.vagaro.com/pro/",
    screenshots: guidedScreenshots("vagaro", 3),
    fields: [
      {
        key: "businessId",
        label: "Business ID",
        type: "text",
        placeholder: "Vagaro business ID",
      },
      {
        key: "apiKey",
        label: "Connection code",
        type: "password",
        placeholder: "Vagaro API key",
        helpTitle: "API key",
        helpBody: "Request API access from Vagaro support, then paste your API key here.",
      },
    ],
    helpSteps: [
      "Request API access from Vagaro support",
      "Copy your business ID and API key from Vagaro settings",
      "Paste both here and click Connect",
    ],
  },
  {
    id: "mindbody",
    name: "Mindbody",
    category: "calendar",
    tagline: "Fitness & wellness booking",
    authType: "api_credentials",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    zapierOnly: true,
    vendorRequirement:
      "Apply for API access in the Mindbody Developer Portal. Approval and a site ID are required before keys work.",
    settingsUrl: "https://developers.mindbodyonline.com/",
    screenshots: guidedScreenshots("mindbody", 3),
    fields: [
      {
        key: "siteId",
        label: "Site ID",
        type: "text",
        placeholder: "Mindbody site ID",
      },
      {
        key: "apiKey",
        label: "Connection code",
        type: "password",
        placeholder: "Mindbody API key",
        helpTitle: "API key",
        helpBody: "Apply for API access via the Mindbody Developer Portal, then paste your API key here.",
      },
    ],
    helpSteps: [
      "Apply for API access in the Mindbody Developer Portal",
      "Copy your site ID and API key",
      "Paste both here and click Connect",
    ],
  },

  // ───────────────────────── Field Service ─────────────────────────
  {
    id: "servicetitan",
    name: "ServiceTitan",
    category: "field_service",
    tagline: "Home & commercial field service",
    authType: "api_credentials",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    zapierOnly: true,
    vendorRequirement:
      "Connect ServiceTitan through Zapier — create a Zap with Halla AI as the trigger and ServiceTitan as the action.",
  },
  {
    id: "housecallpro",
    name: "Housecall Pro",
    category: "field_service",
    tagline: "Home service business management",
    authType: "api_credentials",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    vendorRequirement:
      "Generate an API key from your Housecall Pro account and note your Company ID — both are required to connect.",
    settingsUrl: "https://pro.housecallpro.com/app/settings",
    loginUrl: "https://pro.housecallpro.com/login",
    screenshots: guidedScreenshots("housecallpro", 3),
    fields: [
      {
        key: "apiKey",
        label: "API key",
        type: "password",
        placeholder: "Paste your Housecall Pro API key",
        helpTitle: "Where to find your API key",
        helpBody: "In Housecall Pro: Settings → API Access. Generate a key and copy it here.",
      },
      {
        key: "companyId",
        label: "Company ID",
        type: "text",
        placeholder: "Your Housecall Pro Company ID",
      },
    ],
    helpSteps: [
      "Sign in to Housecall Pro using the button above",
      "Go to Settings → API Access and generate a key",
      "Copy your Company ID and API key",
      "Paste both here and click Connect",
    ],
  },
  {
    id: "jobber",
    name: "Jobber",
    category: "field_service",
    tagline: "Field service scheduling & invoicing",
    authType: "oauth",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    vendorRequirement:
      "Sign in with the Jobber account that should receive new clients and requests from Halla AI.",
    oauthAuthPath: OAUTH_AUTH_PATHS.jobber,
  },

  // ───────────────────────── Property Management ─────────────────────────
  {
    id: "buildium",
    name: "Buildium",
    category: "property_management",
    tagline: "Property management & accounting",
    authType: "api_credentials",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    zapierOnly: true,
    vendorRequirement:
      "Enable the API in Buildium settings and create developer credentials. Both Client ID and Client Secret are shown once at creation.",
    loginUrl: "https://signin.managebuilding.com/manager/public/authentication/login",
    settingsUrl: "https://developer.buildium.com/docs",
    screenshots: guidedScreenshots("buildium", 5),
    fields: [
      {
        key: "clientId",
        label: "Client ID",
        type: "text",
        placeholder: "Paste your Buildium Client ID",
        example: "B4a7e2f1...",
        helpTitle: "Where to find your Client ID",
        helpBody:
          "In Buildium: go to Settings → Application Programming Interface (API) → Generate credentials. Your Client ID appears immediately after generation — copy it now before leaving the page.",
      },
      {
        key: "clientSecret",
        label: "Client secret",
        type: "password",
        placeholder: "Paste your Buildium Client secret",
        helpTitle: "Where to find your Client secret",
        helpBody:
          "Your Client Secret is shown only once right after you generate credentials — it cannot be retrieved later. If you didn't copy it, generate a new set on the same API settings page.",
      },
    ],
    helpSteps: [
      "Click 'Sign in to Buildium' to log in to your account",
      "Enable the API under Settings → Application Settings → API Settings",
      "Go to Settings → Developer Tools and create an API key",
      "Copy the Client ID and Client Secret immediately",
      "Paste both values here",
      "Click Verify Connection",
    ],
  },
  {
    id: "appfolio",
    name: "AppFolio",
    category: "property_management",
    tagline: "Property management software",
    authType: "api_credentials",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    zapierOnly: true,
    vendorRequirement:
      "AppFolio Stack API access must be enabled by your AppFolio account manager — keys are not self-serve for most accounts.",
    loginUrl: "https://www.appfolio.com/",
    settingsUrl: "https://{subdomain}.appfolio.com/users/sign_in",
    screenshots: guidedScreenshots("appfolio", 3),
    fields: [
      {
        key: "apiDomain",
        label: "Company login name",
        type: "text",
        placeholder: "e.g. acme",
        example: "acme",
        helpTitle: "Your AppFolio web address",
        helpBody: "Enter only the first part of your AppFolio URL — e.g. acme from acme.appfolio.com.",
      },
      {
        key: "clientId",
        label: "Client ID",
        type: "text",
        placeholder: "AppFolio API Client ID",
      },
      {
        key: "clientSecret",
        label: "Client secret",
        type: "password",
        placeholder: "AppFolio API Client Secret",
        helpTitle: "Client secret",
        helpBody: "Request API access from your AppFolio account manager.",
      },
    ],
    helpSteps: [
      "Request AppFolio Stack API access from your account manager",
      "Copy your company login name, Client ID, and Client Secret",
      "Paste all three here and click Connect",
    ],
  },
  {
    id: "yardi",
    name: "Yardi",
    category: "property_management",
    tagline: "Property management platform",
    authType: "api_credentials",
    isAdvanced: false,
    ready: true,
    planRequired: "professional",
    zapierOnly: true,
    vendorRequirement:
      "Yardi API credentials are issued by your Yardi representative. You need the API URL, Client ID, and Client Secret they provide.",
    loginUrl: "https://clientcentral.yardi.com/",
    settingsUrl: "https://clientcentral.yardi.com/",
    screenshots: guidedScreenshots("yardi", 3),
    fields: [
      {
        key: "apiDomain",
        label: "API URL",
        type: "url",
        placeholder: "https://api.yourcompany.com",
        helpTitle: "Yardi API URL",
        helpBody: "Paste the API base URL your Yardi representative provided.",
      },
      {
        key: "clientId",
        label: "Client ID",
        type: "text",
        placeholder: "Yardi Client ID",
      },
      {
        key: "clientSecret",
        label: "Client secret",
        type: "password",
        placeholder: "Yardi Client Secret",
        helpTitle: "Client secret",
        helpBody: "Request Yardi Breeze/Voyager API access from your Yardi representative.",
      },
    ],
    helpSteps: [
      "Request Yardi API access from your account representative",
      "Sign in to Client Central if you need product documentation",
      "Copy the API URL, Client ID, and Client Secret they provide",
      "Paste all three here and click Connect",
    ],
  },

  // ───────────────────────── Communication ─────────────────────────
  {
    id: "slack",
    name: "Slack",
    category: "communication",
    tagline: "Alerts for calls, leads & appointments",
    authType: "oauth",
    isAdvanced: false,
    ready: true,
    planRequired: null,
    vendorRequirement:
      "Sign in to Slack, then on the Allow screen pick a channel for Halla AI notifications. A workspace admin may need to approve the app.",
    oauthAuthPath: OAUTH_AUTH_PATHS.slack,
    helpTitle: "Slack connect tips",
    helpBody:
      "Use your normal Slack sign-in. After login you should see “Halla AI wants to access…” — click Allow and choose a channel. If you only see password reset, finish sign-in first, then retry Connect from Halla AI.",
    helpSteps: [
      "Click Connect with Slack in Halla AI",
      "Sign in to your Slack workspace (use the workspace URL if prompted, e.g. yourteam.slack.com)",
      "On the permission screen, click Allow and select a channel for notifications",
      "You should return to Halla AI with Slack marked connected",
    ],
  },

  // ───────────────────────── Advanced Automation ─────────────────────────
  {
    id: "zapier",
    name: "Zapier",
    category: "automation",
    tagline: "Connect 5,000+ apps — included on Essential",
    authType: "api_credentials",
    isAdvanced: true,
    ready: true,
    planRequired: null,
    vendorRequirement:
      "Create a Zap with a Webhooks by Zapier Catch Hook trigger and paste that webhook URL. Works on most Zapier plans including free.",
    settingsUrl:
      "https://zapier.com/webintent/create-zap?steps[0][app]=WebHookAPI&steps[0][action]=hook_v2",
    screenshots: guidedScreenshots("zapier", 4),
    fields: [
      {
        key: "webhookUrl",
        label: "Catch Hook webhook URL",
        type: "url",
        placeholder: "https://hooks.zapier.com/hooks/catch/...",
        helpTitle: "Webhook URL",
        helpBody: "Create a Zap with a Webhooks → Catch Hook trigger, then paste the URL it gives you.",
      },
    ],
  },
];

/** Direct-connect apps on the integrations hub (OAuth + selected API-key CRMs). */
export const OAUTH_INTEGRATIONS: IntegrationDef[] = ALL_INTEGRATION_DEFS.filter(
  (i) => i.authType === "oauth"
);

/** Zapier-only integrations — these are the only supported connection path. */
export const ZAPIER_ONLY_INTEGRATIONS: IntegrationDef[] = ALL_INTEGRATION_DEFS.filter(
  (i) => i.zapierOnly === true
);

/** @deprecated Use OAUTH_INTEGRATIONS — hub cards are OAuth-only; Zapier has its own section. */
export const INTEGRATION_HUB_CATALOG: IntegrationDef[] = OAUTH_INTEGRATIONS;

export function getDirectConnectIntegrations(): IntegrationDef[] {
  return OAUTH_INTEGRATIONS;
}

export function getIntegrationDef(id: string): IntegrationDef | undefined {
  return ALL_INTEGRATION_DEFS.find((i) => i.id === id);
}

export function getIntegrationsByCategory(category: IntegrationCategory): IntegrationDef[] {
  return OAUTH_INTEGRATIONS.filter((i) => i.category === category);
}

/** Hub apps shown when gateway OAuth is configured, or already connected, or API-key ready. */
export function isOAuthIntegrationAvailable(
  integration: IntegrationDef,
  oauthConfigured: Record<string, boolean>,
  connected: boolean
): boolean {
  if (integration.authType === "api_credentials") {
    return integration.ready || connected;
  }
  return connected || oauthConfigured[integration.id] === true;
}

export function filterAvailableOAuthIntegrations(
  items: IntegrationDef[],
  oauthConfigured: Record<string, boolean>,
  connections: Record<string, { status?: string }>
): IntegrationDef[] {
  return items.filter((i) =>
    isOAuthIntegrationAvailable(
      i,
      oauthConfigured,
      connections[i.id]?.status === "connected"
    )
  );
}

export function searchIntegrations(query: string): IntegrationDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return OAUTH_INTEGRATIONS;
  return OAUTH_INTEGRATIONS.filter(
    (i) =>
      i.name.toLowerCase().includes(q) ||
      i.id.includes(q) ||
      i.tagline.toLowerCase().includes(q) ||
      CATEGORY_LABELS[i.category].toLowerCase().includes(q)
  );
}

/** OAuth one-click apps (sign in only — no API key wizard). */
export const OAUTH_ONE_CLICK_APP_IDS = [
  "hubspot",
  "clio",
  "google-calendar",
  "outlook",
  "calendly",
  "acuity",
  "square-appointments",
  "slack",
  "jobber",
] as const;

export type OAuthOneClickAppId = (typeof OAUTH_ONE_CLICK_APP_IDS)[number];

/** True when OAuth connect needs no credential fields before redirect. */
export function isOneClickConnect(integration: IntegrationDef): boolean {
  if (!integration.ready || integration.authType !== "oauth") return false;
  if ((integration.fields?.length ?? 0) > 0) return false;
  return OAUTH_ONE_CLICK_APP_IDS.includes(integration.id as OAuthOneClickAppId);
}

/** Guided API-key setup with screenshots and step-by-step wizard. */
export function isGuidedApiConnect(integration: IntegrationDef): boolean {
  return integration.authType === "api_credentials";
}

/** Notes shown in the connect wizard (vendor plan gates, approvals, Halla AI plan). */
export function getWizardRequirementNotes(integration: IntegrationDef): string[] {
  const notes: string[] = [];
  if (integration.vendorRequirement) notes.push(integration.vendorRequirement);
  if (integration.planRequired) {
    notes.push(
      `Your Halla AI workspace must be on the ${integration.planRequired.charAt(0).toUpperCase()}${integration.planRequired.slice(1)} plan or higher to connect ${integration.name}.`
    );
  }
  return notes;
}

/** True when the gateway already verified + tested during /configure. */
export function isConnectVerifiedMessage(message: string): boolean {
  return /successfully|test successful|connected to|verified|connection test/i.test(message);
}

/** Maps wizard field values to the gateway /configure request body (key-for-key by design). */
export function buildConfigureBody(
  integrationId: string,
  values: Record<string, string>,
  options?: { useAlternateCredentials?: boolean }
): Record<string, string> {
  const def = getIntegrationDef(integrationId);
  const fieldList =
    options?.useAlternateCredentials && def?.alternateCredentialFields?.length
      ? def.alternateCredentialFields
      : def?.fields;
  if (!fieldList) return values;
  const body: Record<string, string> = {};
  for (const field of fieldList) {
    body[field.key] = values[field.key] ?? "";
  }
  return body;
}

function isUnresolvedTemplate(url: string): boolean {
  return /\{[a-zA-Z]+\}|yourcompany/.test(url);
}

function pathLooksLikeSignIn(url: string): boolean {
  return /\/login|signin|sign-in/i.test(url);
}

/** Public developer/docs pages — not in-app settings after product login. */
function isPublicVendorPortal(url: string): boolean {
  return /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?(developer|developers)\.|api-console\.|\/developers\/?(?:\?|$)|\/docs\/?(?:\?|#|$)/i.test(
    url
  );
}

/** Deep links that only work once signed in to the vendor app. */
function isInAppSettingsDeepLink(url: string): boolean {
  return /\/settings\/|\/admin\/settings|\/integrations\/api|app\.php\?action=/i.test(url);
}

function hasTenantSubdomain(integration: IntegrationDef, sub: string): boolean {
  return Boolean(sub && integration.settingsUrl?.includes("{"));
}

function subdomainFromValues(values: Record<string, string>): string {
  for (const key of ["domain", "apiDomain", "subdomain"]) {
    const raw = values[key]?.trim();
    if (!raw) continue;
    const host = raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    const slug = host.split(".")[0]?.trim();
    if (slug && slug !== "yourcompany") return slug;
  }
  return "";
}

function applySubdomainTemplate(url: string, sub: string): string {
  let resolved = url;
  for (const [needle, value] of [
    ["{subdomain}", sub],
    ["{domain}", sub],
    ["{apiDomain}", sub],
    ["yourcompany", sub],
  ] as const) {
    if (value) resolved = resolved.split(needle).join(value);
  }
  return resolved;
}

export type IntegrationOpenLink = {
  url: string;
  kind: "login" | "settings";
};

/** Sign-in or settings URL for the guided integration wizard — never returns broken placeholders. */
export function resolveIntegrationOpenLink(
  integration: IntegrationDef,
  values: Record<string, string> = {}
): IntegrationOpenLink | undefined {
  const sub = subdomainFromValues(values);

  if (integration.settingsUrl) {
    const resolved = applySubdomainTemplate(integration.settingsUrl, sub);
    if (!isUnresolvedTemplate(resolved)) {
      if (hasTenantSubdomain(integration, sub)) {
        const usesLogin =
          integration.loginUrl != null &&
          (resolved === integration.loginUrl || pathLooksLikeSignIn(resolved));
        return { url: resolved, kind: usesLogin ? "login" : "settings" };
      }

      if (integration.loginUrl && isInAppSettingsDeepLink(resolved)) {
        return { url: integration.loginUrl, kind: "login" };
      }

      if (
        integration.loginUrl &&
        isPublicVendorPortal(resolved) &&
        !isPublicVendorPortal(integration.loginUrl) &&
        !pathLooksLikeSignIn(resolved)
      ) {
        return { url: integration.loginUrl, kind: "login" };
      }

      const usesLogin =
        integration.loginUrl != null &&
        (resolved === integration.loginUrl || pathLooksLikeSignIn(resolved));
      return { url: resolved, kind: usesLogin ? "login" : "settings" };
    }
  }

  if (integration.loginUrl) {
    return { url: integration.loginUrl, kind: "login" };
  }

  return undefined;
}

/** @deprecated Use resolveIntegrationOpenLink */
export function resolveIntegrationSettingsUrl(
  integration: IntegrationDef,
  values: Record<string, string> = {}
): string | undefined {
  return resolveIntegrationOpenLink(integration, values)?.url;
}

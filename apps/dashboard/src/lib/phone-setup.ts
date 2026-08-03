import { asArray } from "@/lib/api";

export type PhoneSearchRow = {
  phoneNumber: string;
  region?: string;
  friendlyName?: string;
  capabilities: string[];
  cost: number;
};

export type PhoneProvisioningStatus = {
  activeCount: number;
  maxAllowed: number;
  canAddMore: boolean;
  remaining: number;
  twilioConfigured?: boolean;
  gatewayReady?: boolean;
};

export function isLocalDashboard(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

/** Map gateway/Twilio errors to user-facing copy (hide env var names in production). */
export function friendlyPhoneSetupError(message: string): string {
  const m = message.trim();
  if (!m) return "Phone setup failed. Please try again.";

  if (/twilio is not configured|TWILIO_ACCOUNT/i.test(m)) {
    return isLocalDashboard()
      ? "Twilio is not configured on the gateway. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in apps/gateway/.env."
      : "Phone provisioning is not available yet. Please contact support — Twilio is not configured on the server.";
  }

  if (/gateway public|RENDER_EXTERNAL|TWILIO_STREAM|not configured/i.test(m)) {
    return isLocalDashboard()
      ? "The gateway needs a public HTTPS URL for Twilio. Set TWILIO_STREAM_WSS_URL or use Render, and tunnel if testing locally."
      : "We couldn’t connect your phone line right now. Our team may still be finishing call routing setup — try again in a few minutes or contact support.";
  }

  if (/limit reached|Upgrade plan/i.test(m)) {
    return m;
  }

  if (/area code must/i.test(m)) {
    return "Enter a valid 3-digit US area code (e.g. 212).";
  }

  if (/tenant not configured|403|Access denied/i.test(m)) {
    return "Your workspace isn’t ready yet. Refresh the page or sign out and back in, then try again.";
  }

  if (/Unauthorized|Session expired/i.test(m)) {
    return m;
  }

  return m.length > 160 ? `${m.slice(0, 157)}…` : m;
}

export function parsePhoneSearchResults(data: unknown): PhoneSearchRow[] {
  const list = asArray<Record<string, unknown>>(data);
  return list.map((row) => ({
    phoneNumber: String(row.phoneNumber ?? ""),
    region:
      typeof row.region === "string"
        ? row.region
        : typeof row.friendlyName === "string"
          ? row.friendlyName
          : undefined,
    friendlyName: typeof row.friendlyName === "string" ? row.friendlyName : undefined,
    capabilities: Array.isArray(row.capabilities)
      ? (row.capabilities as unknown[]).map(String)
      : [],
    cost: typeof row.cost === "number" ? row.cost : 0,
  })).filter((r) => r.phoneNumber.length > 0);
}

export function provisioningBlockedReason(status: PhoneProvisioningStatus | null): string | null {
  if (!status) return null;
  if (!status.twilioConfigured) {
    return friendlyPhoneSetupError("Twilio is not configured");
  }
  if (!status.gatewayReady) {
    return friendlyPhoneSetupError("Gateway public HTTPS URL is not configured");
  }
  if (!status.canAddMore) {
    return `You’ve reached your limit (${status.activeCount}/${status.maxAllowed} numbers). Upgrade your plan for more lines.`;
  }
  return null;
}

"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { getPlan, hasAccess } from "@/lib/store";
import { IntegrationIcon } from "@/components/integrations/IntegrationIcon";
import {
  getIntegrationsByCategory,
  isOneClickConnect,
  type IntegrationDef,
} from "@/lib/integration-hub-catalog";
import { startIntegrationOAuth } from "@/lib/integration-oauth";
import { ONBOARDING_RETURN_KEY } from "@/lib/onboarding-return";

type OAuthCapability = { provider: string; configured: boolean };
type CatalogResponse = { connections?: Record<string, { status?: string }> };

/**
 * A new workspace is on the free trial, which includes Professional features (the dashboard says so). The plan check alone ranks "trial"
 * below Professional, which hid Calendly, Square and HubSpot until the page was reloaded, so a trial counts as allowed here.
 */
export function allowsDuringSetup(requiredPlan?: string): boolean {
  return hasAccess(requiredPlan) || getPlan() === "trial";
}

/** Calendars and CRMs a new client can link with one sign-in, and that their plan allows. Pure, so it can be tested. */
export function pickOnboardingTools(
  oauthConfigured: Record<string, boolean>,
  connected: Record<string, boolean>,
  allows: (plan?: string) => boolean = allowsDuringSetup
): { calendars: IntegrationDef[]; crms: IntegrationDef[] } {
  const usable = (i: IntegrationDef) =>
    isOneClickConnect(i) &&
    (connected[i.id] === true || (oauthConfigured[i.id] === true && (!i.planRequired || allows(i.planRequired))));
  return {
    calendars: getIntegrationsByCategory("calendar").filter(usable),
    crms: getIntegrationsByCategory("crm").filter(usable),
  };
}

type Props = {
  /** Called once the client has at least one tool linked, so the page can record it. */
  onConnectedChange?: (anyConnected: boolean) => void;
};

export function OnboardingConnectTools({ onConnectedChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [oauthConfigured, setOauthConfigured] = useState<Record<string, boolean>>({});
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [caps, catalog] = await Promise.all([
        api.get<OAuthCapability[]>("/integrations/oauth-capabilities").catch(() => []),
        api.get<CatalogResponse>("/integrations/catalog").catch(() => null),
      ]);
      if (cancelled) return;
      const cfg: Record<string, boolean> = {};
      for (const row of Array.isArray(caps) ? caps : []) cfg[row.provider] = row.configured;
      const conn: Record<string, boolean> = {};
      for (const [id, c] of Object.entries(catalog?.connections ?? {})) conn[id] = c?.status === "connected";
      setOauthConfigured(cfg);
      setConnected(conn);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { calendars, crms } = pickOnboardingTools(oauthConfigured, connected);
  const anyConnected = [...calendars, ...crms].some((i) => connected[i.id]);

  useEffect(() => {
    if (!loading) onConnectedChange?.(anyConnected);
  }, [loading, anyConnected, onConnectedChange]);

  async function connect(integration: IntegrationDef) {
    setConnecting(integration.id);
    setError(null);
    try {
      // The provider sends the client to the dashboard afterwards; this flag sends them back here.
      try {
        window.sessionStorage.setItem(ONBOARDING_RETURN_KEY, "1");
      } catch {
        /* private mode: they land on the dashboard and can reopen setup */
      }
      await startIntegrationOAuth(integration);
    } catch (e) {
      setConnecting(null);
      setError(e instanceof Error ? e.message : `Could not connect ${integration.name}`);
    }
  }

  function group(title: string, hint: string, items: IntegrationDef[]) {
    if (items.length === 0) return null;
    return (
      <div className="text-left space-y-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-foreground-secondary">{hint}</p>
        </div>
        <ul className="space-y-2">
          {items.map((i) => {
            const isConnected = connected[i.id] === true;
            return (
              <li
                key={i.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <IntegrationIcon id={i.id} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{i.name}</span>
                    <span className="block text-xs text-foreground-secondary truncate">{i.tagline}</span>
                  </span>
                </span>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" /> Connected
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void connect(i)}
                    disabled={connecting !== null}
                    className="btn-ghost !px-4 !py-1.5 text-sm shrink-0"
                  >
                    {connecting === i.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Connect"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="py-4 space-y-4">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold">Connect your tools</h2>
        <p className="text-foreground-secondary max-w-sm mx-auto text-sm">
          Link your calendar so your receptionist can book appointments, and your CRM so every caller is saved. This is optional: you can do it later from Integrations.
        </p>
      </div>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-foreground-secondary" />
        </div>
      ) : calendars.length + crms.length === 0 ? (
        <p className="text-sm text-foreground-secondary text-center">
          Calendar and CRM connections are not ready on your plan yet. You can add them later from Integrations.
        </p>
      ) : (
        <div className="space-y-5">
          {group("Calendar", "So callers can book a time.", calendars)}
          {group("CRM", "So every caller becomes a contact.", crms)}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  ACKNOWLEDGEMENT,
  PILOTS,
  buildPlan,
  createRuntimeKey,
  discardKey,
  discardWebhook,
  registerPilotWebhook,
  type Confirmation,
  type PilotKey,
  type PilotPlan,
} from "@/lib/klaros-pilot-setup";

/**
 * Owner-only setup for the Klaros pilot connection (API key + signed webhook). Internal pilot tooling, so it is English-only and
 * OFF unless NEXT_PUBLIC_KLAROS_PILOT_SETUP=true is set at build time. It runs on the dashboard's own API client: no cookie or token
 * is read here. One-time values live only in this component's state until the owner confirms they are stored, and are cleared on
 * navigation away.
 */
const ENABLED = process.env.NEXT_PUBLIC_KLAROS_PILOT_SETUP === "true";

interface OneTime {
  kind: "key" | "webhook";
  id: string;
  label: string;
  env: string;
  value: string;
}

export default function KlarosPilotPage() {
  const [pilot, setPilot] = useState<PilotKey>("medical_tourism");
  const [plan, setPlan] = useState<PilotPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [typedId, setTypedId] = useState("");
  const [typedName, setTypedName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [oneTime, setOneTime] = useState<OneTime | null>(null);
  const [shown, setShown] = useState(false);

  const confirmation: Confirmation = {
    tenantId: typedId,
    tenantName: typedName,
    acknowledge: acknowledged ? ACKNOWLEDGEMENT : "",
  };

  const clearSecrets = useCallback(() => {
    setOneTime(null);
    setShown(false);
  }, []);

  // Never keep a one-time value after the page is left or the pilot is changed.
  useEffect(() => clearSecrets, [clearSecrets]);

  // A value that is on screen can never be shown again: warn before the tab is closed or reloaded.
  useEffect(() => {
    if (!oneTime) return undefined;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [oneTime]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, []);

  const loadPlan = () =>
    run(async () => {
      clearSecrets();
      setPlan(await buildPlan(api, pilot));
    });

  const makeKey = () =>
    run(async () => {
      const r = await createRuntimeKey(api, pilot, confirmation);
      if (r.status === "exists") {
        setNote("A runtime key already exists (prefix " + r.prefix + "). Nothing was created. If its value was lost, revoke it and create it again.");
      } else {
        setOneTime({ kind: "key", id: r.id, label: "API key", env: PILOTS[pilot].keyEnv, value: r.value });
      }
      setPlan(await buildPlan(api, pilot));
    });

  const makeWebhook = () =>
    run(async () => {
      const r = await registerPilotWebhook(api, pilot, confirmation);
      if (r.status === "exists") {
        setNote("A webhook for this pilot already exists. Nothing was created. Its secret cannot be shown again.");
      } else {
        setOneTime({ kind: "webhook", id: r.id, label: "Webhook signing secret", env: PILOTS[pilot].secretEnv, value: r.secret });
      }
      setPlan(await buildPlan(api, pilot));
    });

  const discard = () =>
    run(async () => {
      if (!oneTime) return;
      if (oneTime.kind === "key") await discardKey(api, oneTime.id, confirmation);
      else await discardWebhook(api, oneTime.id, confirmation);
      clearSecrets();
      setNote("The value was discarded and removed from the gateway. You can create it again.");
      setPlan(await buildPlan(api, pilot));
    });

  // Recovery for a one-time value that was lost (tab closed, never stored): remove the old object so a new one can be created.
  const removeExistingKey = () =>
    run(async () => {
      if (!plan?.keyExists) return;
      await discardKey(api, plan.keyExists.id, confirmation);
      setNote("The existing key was revoked. You can create a new one.");
      setPlan(await buildPlan(api, pilot));
    });

  const removeExistingWebhook = () =>
    run(async () => {
      if (!plan?.webhookExists) return;
      await discardWebhook(api, plan.webhookExists.id, confirmation);
      setNote("The existing webhook was deleted. You can register it again.");
      setPlan(await buildPlan(api, pilot));
    });

  const copyValue = async () => {
    if (!oneTime) return;
    try {
      await navigator.clipboard.writeText(oneTime.value);
      setNote("Copied. Paste it into the protected Klaros environment variable now, then copy any other text to clear the clipboard.");
    } catch {
      setError("The browser would not copy it. Reveal the value and select it manually, or discard it and try again.");
    }
  };

  if (!ENABLED) {
    return <div className="p-6 text-sm text-muted-foreground">This page is not enabled.</div>;
  }

  const confirmed = plan !== null && typedId.trim().toLowerCase() === plan.tenant.id && typedName === plan.tenant.name && acknowledged;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Klaros pilot connection</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates this business&apos;s runtime API key and registers its signed webhook to the Klaros pilot. Owner only. Values are shown once.
        </p>
      </header>

      <section className="space-y-3 rounded-lg border p-4">
        <label className="block text-sm font-medium" htmlFor="pilot">
          Pilot
        </label>
        <select
          id="pilot"
          className="w-full rounded border bg-transparent p-2 text-sm"
          value={pilot}
          disabled={busy}
          onChange={(e) => {
            setPilot(e.target.value as PilotKey);
            setPlan(null);
            clearSecrets();
            setTypedId("");
            setTypedName("");
            setAcknowledged(false);
            setError(null);
            setNote(null);
          }}
        >
          {(Object.keys(PILOTS) as PilotKey[]).map((k) => (
            <option key={k} value={k}>
              {PILOTS[k].label}
            </option>
          ))}
        </select>
        <button type="button" className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={loadPlan}>
          {busy ? "Working..." : "Review plan (read-only)"}
        </button>
      </section>

      {error && (
        <div role="alert" className="rounded border border-red-500 p-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {note && (
        <div role="status" className="rounded border p-3 text-sm">
          {note}
        </div>
      )}

      {plan && (
        <section className="space-y-3 rounded-lg border p-4 text-sm">
          <h2 className="font-medium">Plan for {PILOTS[plan.pilot].label}</h2>
          <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1">
            <dt>Signed in as tenant</dt>
            <dd className="break-all font-mono">{plan.tenant.id}</dd>
            <dt>Tenant name</dt>
            <dd>{plan.tenant.name}</dd>
            <dt>Escalation number</dt>
            <dd>{plan.tenant.escalationNumberSet ? "configured" : "NOT SET: set it in Business Profile first"}</dd>
            <dt>Runtime key</dt>
            <dd>
              {plan.keyName}; scopes {plan.scopes.join(", ")}; expires in {plan.keyExpiresInDays} days.{" "}
              {plan.keyExists ? "Already exists (prefix " + plan.keyExists.prefix + ")." : "Not created yet."}
            </dd>
            <dt>Webhook</dt>
            <dd className="break-all">
              {plan.webhookUrl}
              <br />
              events: {plan.events.join(", ")}.{" "}
              {plan.webhookExists ? "Already registered." : "Not registered yet."}
            </dd>
          </dl>

          <div className="space-y-2 border-t pt-3">
            <p>To change anything, type this tenant&apos;s exact id and exact name, and tick the box.</p>
            <input
              aria-label="Tenant id"
              className="w-full rounded border bg-transparent p-2 font-mono"
              placeholder="Tenant id"
              value={typedId}
              onChange={(e) => setTypedId(e.target.value)}
              autoComplete="off"
            />
            <input
              aria-label="Tenant name"
              className="w-full rounded border bg-transparent p-2"
              placeholder="Tenant name (exact)"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              autoComplete="off"
            />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
              <span>{ACKNOWLEDGEMENT}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded border px-3 py-2" disabled={busy || !confirmed || !!oneTime} onClick={makeKey}>
                1. Create runtime key
              </button>
              <button type="button" className="rounded border px-3 py-2" disabled={busy || !confirmed || !!oneTime} onClick={makeWebhook}>
                2. Register webhook
              </button>
            </div>
            {(plan.keyExists || plan.webhookExists) && (
              <div className="flex flex-wrap gap-2 border-t pt-2">
                <span className="w-full text-xs text-muted-foreground">
                  If an existing value was lost, remove it here (same confirmation) and create it again.
                </span>
                {plan.keyExists && (
                  <button type="button" className="rounded border border-red-500 px-3 py-2 text-red-600" disabled={busy || !confirmed || !!oneTime} onClick={removeExistingKey}>
                    Revoke existing key
                  </button>
                )}
                {plan.webhookExists && (
                  <button type="button" className="rounded border border-red-500 px-3 py-2 text-red-600" disabled={busy || !confirmed || !!oneTime} onClick={removeExistingWebhook}>
                    Delete existing webhook
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {oneTime && (
        <section className="space-y-3 rounded-lg border-2 border-amber-500 p-4 text-sm">
          <h2 className="font-medium">{oneTime.label}: shown once</h2>
          <p>
            Paste it into the protected Klaros environment variable <span className="font-mono">{oneTime.env}</span> (Render, klaros-halla-pilot,
            Environment). It cannot be shown again. Do not send it in chat, email or a screenshot.
          </p>
          <input
            aria-label={oneTime.label}
            readOnly
            className="w-full rounded border bg-transparent p-2 font-mono"
            type={shown ? "text" : "password"}
            value={oneTime.value}
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded border px-3 py-2" onClick={() => setShown((s) => !s)}>
              {shown ? "Hide" : "Reveal"}
            </button>
            <button type="button" className="rounded border px-3 py-2" onClick={copyValue}>
              Copy
            </button>
            <button type="button" className="rounded border px-3 py-2" onClick={clearSecrets}>
              I stored it in Klaros: clear it from this page
            </button>
            <button type="button" className="rounded border border-red-500 px-3 py-2 text-red-600" disabled={busy || !confirmed} onClick={discard}>
              I could not store it: discard it
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

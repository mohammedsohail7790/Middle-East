"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Loader2,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { showDashboardToast } from "@/lib/dashboard-toast";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import { hasAccess } from "@/lib/store";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { IntegrationIcon } from "@/components/integrations/IntegrationIcon";
import { IntegrationCredentialField } from "@/components/integrations/IntegrationCredentialField";
import { IntegrationSetupMedia } from "@/components/integrations/IntegrationSetupMedia";
import { IntegrationOnboardingCallOffer } from "@/components/integrations/IntegrationOnboardingCallOffer";
import { IntegrationWizardRequirements } from "@/components/integrations/IntegrationWizardRequirements";
import { IntegrationZapierEasyPath } from "@/components/integrations/IntegrationZapierEasyPath";
import {
  getGuidedWizardIntro,
  getPlainCredentialCopy,
} from "@/lib/integration-plain-language";
import {
  buildConfigureBody,
  CALENDAR_DISCONNECT_SLUG,
  isConnectVerifiedMessage,
  resolveIntegrationOpenLink,
  type IntegrationDef,
} from "@/lib/integration-hub-catalog";
import { startIntegrationOAuth } from "@/lib/integration-oauth";
import { navigateToZapierSetup } from "@/lib/zapier-connect";

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export type IntegrationConnectionInfo = {
  status: string;
  last_sync_at: string | null;
  last_test_at: string | null;
  last_error: string | null;
};

type TestResult = { success: boolean; message: string; recordUrl?: string };

type Props = {
  integration: IntegrationDef;
  connection?: IntegrationConnectionInfo;
  oauthConfigured: boolean;
  onStatusChange: () => void;
  onClose: () => void;
  embedded?: boolean;
};

function hasTestStep(integration: IntegrationDef): boolean {
  if (integration.authType === "api_credentials") return integration.ready;
  return integration.category === "crm" || integration.category === "field_service";
}

function firstMissingField(
  integration: IntegrationDef,
  fields: IntegrationDef["fields"],
  values: Record<string, string>
) {
  if (!fields?.length) return undefined;
  return fields.find((f) => !values[f.key]?.trim());
}

export function IntegrationConnectWizard({
  integration,
  connection,
  oauthConfigured,
  onStatusChange,
  onClose,
  embedded = false,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [useApiKeyMode, setUseApiKeyMode] = useState(false);
  const [showDirectApi, setShowDirectApi] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(connection?.status ?? "disconnected");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showTestStep, setShowTestStep] = useState(false);
  const [autoTestStarted, setAutoTestStarted] = useState(false);

  useEffect(() => {
    setValues({});
    setUseApiKeyMode(false);
    setShowDirectApi(false);
    setErrorMessage(null);
    setTestResult(null);
    setAutoTestStarted(false);
    const status = connection?.status ?? "disconnected";
    setLocalStatus(status);
    setShowTestStep(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integration.id]);

  const isLocked =
    !!integration.planRequired && !hasAccess(integration.planRequired) && localStatus !== "connected";

  const fields =
    useApiKeyMode && integration.alternateCredentialFields?.length
      ? integration.alternateCredentialFields
      : (integration.fields ?? []);

  const canStartOAuth = oauthConfigured;

  const startOAuth = async () => {
    if (!integration.oauthAuthPath) return;
    const missing = firstMissingField(integration, fields, values);
    if (missing) {
      const plain = getPlainCredentialCopy(integration, missing);
      setErrorMessage(`Please enter: ${plain.label.toLowerCase()}.`);
      return;
    }
    setConnectingOAuth(true);
    setErrorMessage(null);
    try {
      await startIntegrationOAuth(integration, values);
    } catch (e) {
      showDashboardToast({
        type: "error",
        title: `Could not connect ${integration.name}`,
        message: e instanceof Error ? e.message : "Could not start sign-in",
      });
      setConnectingOAuth(false);
    }
  };

  const submitCredentials = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const body = buildConfigureBody(integration.id, values, {
        useAlternateCredentials: useApiKeyMode,
      });
      for (const key of Object.keys(body)) {
        body[key] = body[key].trim();
      }
      const result = await api.post<{ success: boolean; message: string }>(
        `/integrations/${integration.id}/configure`,
        body
      );
      onStatusChange();
      syncDashboardAction("integrations");
      if (!integration.ready) {
        setLocalStatus("coming_soon");
        setTestResult({ success: true, message: result.message });
        return;
      }
      setLocalStatus("connected");
      if (hasTestStep(integration)) {
        if (isConnectVerifiedMessage(result.message ?? "")) {
          setTestResult({ success: true, message: result.message });
          return;
        }
        setAutoTestStarted(true);
        void sendTest();
      } else {
        setTestResult({ success: true, message: result.message });
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setBusy(false);
    }
  };

  const connectWithCredentials = () => {
    const missing = firstMissingField(integration, fields, values);
    if (missing) {
      const plain = getPlainCredentialCopy(integration, missing);
      setErrorMessage(`Please enter: ${plain.label.toLowerCase()}.`);
      return;
    }
    setErrorMessage(null);
    void submitCredentials();
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const data = await api.post<TestResult>(`/integrations/${integration.id}/test-lead`, {});
      setTestResult(data);
      setLocalStatus(data.success ? "connected" : "error");
      setShowTestStep(false);
      onStatusChange();
      syncDashboardAction("integrations");
    } catch (e) {
      setTestResult({ success: false, message: e instanceof Error ? e.message : "Test failed" });
      setLocalStatus("error");
    } finally {
      setBusy(false);
    }
  };

  const retryCredentials = () => {
    setLocalStatus("disconnected");
    setTestResult(null);
    setShowTestStep(false);
    setAutoTestStarted(false);
    setErrorMessage(null);
  };

  useEffect(() => {
    if (
      localStatus !== "connected" ||
      !hasTestStep(integration) ||
      testResult ||
      autoTestStarted ||
      busy ||
      connection?.last_test_at
    ) {
      return;
    }
    setAutoTestStarted(true);
    void sendTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStatus, integration.id, connection?.last_test_at, testResult, autoTestStarted, busy]);

  const disconnect = async () => {
    setBusy(true);
    try {
      const calendarSlug = CALENDAR_DISCONNECT_SLUG[integration.id];
      if (calendarSlug) {
        await api.del(`/calendar/connection?provider=${encodeURIComponent(calendarSlug)}`);
      } else {
        await api.del(`/integrations/${integration.id}/disconnect`);
      }
      onStatusChange();
      syncDashboardAction("integrations");
      setLocalStatus("disconnected");
      setValues({});
      setTestResult(null);
      setShowTestStep(false);
    } catch (e) {
      showDashboardToast({
        type: "error",
        title: `Could not disconnect ${integration.name}`,
        message: e instanceof Error ? e.message : "Disconnect failed",
      });
    } finally {
      setBusy(false);
    }
  };

  const renderLocked = () => (
    <div className="text-center py-8 space-y-3">
      <IntegrationWizardRequirements integration={integration} />
      <p className="text-sm text-foreground">
        {integration.name} requires a {integration.planRequired} plan.
      </p>
      <a href="/dashboard/billing" className="btn-primary text-sm inline-flex">
        Upgrade plan
      </a>
    </div>
  );

  const renderOAuthConnect = () => (
    <div className="space-y-4 max-w-lg">
      <IntegrationWizardRequirements integration={integration} />
      {fields.length > 0 && (
        <div className="space-y-3">
          {fields.map((field) => (
            <IntegrationCredentialField
              key={field.key}
              field={field}
              value={values[field.key] ?? ""}
              onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
              showHelp
              plain={getPlainCredentialCopy(integration, field)}
            />
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {fields.length > 0
          ? `Enter the required details below, then connect your ${integration.name} account.`
          : `Sign in with your ${integration.name} account to connect.`}
      </p>
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      <button
        type="button"
        className="btn-primary"
        disabled={connectingOAuth || !canStartOAuth}
        onClick={() => void startOAuth()}
      >
        {connectingOAuth ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={ICON_STROKE} />
        ) : (
          "Connect"
        )}
      </button>
      {!oauthConfigured && (
        <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2.5 space-y-2">
          <p className="text-xs text-amber-900 dark:text-amber-200">
            Direct sign-in is not configured on this deployment. Your administrator must add the
            required server settings, or you can connect through Zapier instead.
          </p>
          {integration.category === "crm" || integration.category === "calendar" ? (
            <button
              type="button"
              className="text-xs font-medium text-accent hover:underline"
              onClick={() => navigateToZapierSetup(integration.id)}
            >
              Connect via Zapier
            </button>
          ) : null}
        </div>
      )}
      {integration.alternateCredentialFields?.length ? (
        <button
          type="button"
          className="text-xs font-medium text-accent hover:underline block"
          onClick={() => {
            setUseApiKeyMode(true);
            setErrorMessage(null);
          }}
        >
          {integration.alternateCredentialLabel ?? "Connect with API credentials instead"}
        </button>
      ) : null}
    </div>
  );

  const openLink = resolveIntegrationOpenLink(integration, values);

  const renderCredentialFields = () => (
    <div className="space-y-4 max-w-lg">
      <IntegrationWizardRequirements integration={integration} />

      {integration.oauthAuthPath && integration.alternateCredentialFields?.length ? (
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => {
            setUseApiKeyMode(false);
            setErrorMessage(null);
          }}
        >
          ← Back to sign-in connect
        </button>
      ) : null}

      <p className="text-sm text-muted-foreground leading-relaxed rounded-lg bg-muted/30 border border-border px-3 py-2.5">
        {getGuidedWizardIntro(integration)}
      </p>

      {openLink && (
        <a
          href={openLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary text-sm inline-flex items-center gap-1.5 w-full justify-center"
        >
          {openLink.kind === "login" ? (
            <>Sign in to {integration.name}</>
          ) : (
            <>
              Open {integration.name} settings <ExternalLink className="size-3.5" />
            </>
          )}
          <span className="text-[11px] font-normal opacity-90">
            {openLink.kind === "login" ? "(then copy your API key)" : "(copy from here)"}
          </span>
        </a>
      )}

      <div className="space-y-3">
        {fields.map((field) => (
          <IntegrationCredentialField
            key={field.key}
            field={field}
            value={values[field.key] ?? ""}
            onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
            showHelp
            plain={getPlainCredentialCopy(integration, field)}
          />
        ))}
      </div>

      {errorMessage && (
        <>
          <p className="text-sm text-red-600">{errorMessage}</p>
          <IntegrationWizardRequirements integration={integration} variant="warning" />
          <IntegrationOnboardingCallOffer integrationName={integration.name} variant="prominent" />
        </>
      )}

      <button
        type="button"
        className="btn-primary text-sm w-full"
        disabled={busy}
        onClick={() => connectWithCredentials()}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin mx-auto" strokeWidth={ICON_STROKE} />
        ) : (
          "Connect"
        )}
      </button>

      {(integration.screenshots?.length || integration.helpSteps?.length || integration.videoUrl) && (
        <details className="text-xs text-muted-foreground rounded-lg border border-border/60 px-3 py-2">
          <summary className="cursor-pointer flex items-center gap-1 font-medium text-foreground">
            <HelpCircle className="size-3.5" /> Need help finding your credentials?
          </summary>
          <div className="mt-3 space-y-3">
            <IntegrationSetupMedia
              screenshots={integration.screenshots}
              videoUrl={integration.videoUrl}
              helpSteps={integration.helpSteps}
              activeStepIndex={0}
            />
            {integration.helpSteps && (
              <ol className="list-decimal list-inside space-y-1">
                {integration.helpSteps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
          </div>
        </details>
      )}

      {integration.id !== "zapier" && (
        <p className="text-xs text-muted-foreground text-center">
          Want something simpler?{" "}
          <a href="#zapier-connect" className="text-accent underline underline-offset-2">
            Use Zapier instead
          </a>{" "}
          — one link works with 5,000+ apps, no API keys.
        </p>
      )}
    </div>
  );

  const renderTestStep = () => (
    <div className="space-y-4 text-center py-4">
      {busy ? (
        <>
          <Loader2 className="size-10 text-accent mx-auto animate-spin" strokeWidth={1.5} />
          <p className="text-base font-semibold">Sending a test to {integration.name}…</p>
          <p className="text-sm text-muted-foreground">This usually takes a few seconds.</p>
        </>
      ) : (
        <>
          <CheckCircle2 className="size-10 text-emerald-600 mx-auto" strokeWidth={1.5} />
          <p className="text-base font-semibold">{integration.name} connected</p>
          <p className="text-sm text-muted-foreground">Send a test to confirm everything works.</p>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            disabled={busy}
            onClick={() => void sendTest()}
          >
            <Send className="size-4" />
            Send test
          </button>
        </>
      )}
      <div>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => void disconnect()}>
          Disconnect
        </button>
      </div>
    </div>
  );

  const renderConnectedSummary = () => {
    const hasError = localStatus === "error" || !!connection?.last_error;
    return (
      <div className="text-center py-6 space-y-4">
        <CheckCircle2
          className={`size-14 mx-auto ${hasError ? "text-amber-500" : "text-emerald-600"}`}
          strokeWidth={1.5}
        />
        <div className="space-y-1">
          <p className="text-lg font-semibold text-foreground">
            {hasError ? `${integration.name} needs attention` : `${integration.name} is connected`}
          </p>
          {connection?.last_test_at && (
            <p className="text-xs text-muted-foreground">
              Last verified {timeAgo(connection.last_test_at)}
            </p>
          )}
          {connection?.last_sync_at && (
            <p className="text-xs text-muted-foreground">
              Last synced {timeAgo(connection.last_sync_at)}
            </p>
          )}
        </div>
        {connection?.last_error && (
          <>
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 text-left">
              <p className="font-medium mb-0.5">Last error</p>
              <p className="text-amber-700 dark:text-amber-400">{connection.last_error}</p>
            </div>
            <IntegrationWizardRequirements integration={integration} variant="warning" />
          </>
        )}
        <div className="flex gap-2 justify-center">
          {hasTestStep(integration) && (
            <button type="button" className="btn-ghost text-sm" onClick={() => setShowTestStep(true)}>
              Send test
            </button>
          )}
          <button type="button" className="btn-ghost text-sm text-red-600" disabled={busy} onClick={() => void disconnect()}>
            Disconnect
          </button>
        </div>
      </div>
    );
  };

  const renderDone = () => {
    const testPassed = testResult?.success !== false;
    return (
      <div className="text-center py-6 space-y-4">
        {testPassed ? (
          <CheckCircle2 className="size-14 mx-auto text-emerald-600" strokeWidth={1.5} />
        ) : (
          <XCircle className="size-14 mx-auto text-amber-600" strokeWidth={1.5} />
        )}
        <div>
          <p className="text-lg font-semibold text-foreground">
            {testPassed ? `${integration.name} connected` : `Couldn't verify ${integration.name}`}
          </p>
          {testResult && (
            <p className={`text-sm mt-1 ${testPassed ? "text-emerald-700" : "text-amber-800"}`}>
              {testResult.message}
            </p>
          )}
          {!testPassed && (
            <>
              <IntegrationWizardRequirements integration={integration} variant="warning" />
              <p className="text-xs text-muted-foreground mt-2">
                Call data will not sync until the connection test passes. Use Fix credentials to reconnect with the
                correct API key or token.
              </p>
            </>
          )}
        </div>
        {testResult?.recordUrl && (
          <a
            href={testResult.recordUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-sm inline-flex items-center gap-1"
          >
            View in {integration.name} <ExternalLink className="size-3.5" />
          </a>
        )}
        <div className="flex flex-wrap gap-2 justify-center">
          {!testPassed && (
            <>
              <button type="button" className="btn-primary text-sm" disabled={busy} onClick={retryCredentials}>
                Fix credentials
              </button>
              <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={() => void sendTest()}>
                Retry test
              </button>
            </>
          )}
          <button type="button" className="btn-ghost text-sm text-red-600" disabled={busy} onClick={() => void disconnect()}>
            Disconnect
          </button>
          {testPassed && (
            <button type="button" className="btn-primary text-sm" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderComingSoonSaved = () => (
    <div className="text-center py-6 space-y-4">
      <CheckCircle2 className="size-12 text-accent mx-auto" strokeWidth={1.5} />
      <div>
        <p className="text-lg font-semibold text-foreground">Saved!</p>
        <p className="text-sm text-muted-foreground mt-1">
          {testResult?.message || `We'll let you know as soon as ${integration.name} sync is ready.`}
        </p>
      </div>
      <button
        type="button"
        className="btn-ghost text-sm"
        onClick={() => {
          setLocalStatus("disconnected");
          setValues({});
          setTestResult(null);
        }}
      >
        Update credentials
      </button>
    </div>
  );

  let body: React.ReactNode;
  if (isLocked) {
    body = renderLocked();
  } else if (localStatus === "coming_soon") {
    body = renderComingSoonSaved();
  } else if (localStatus === "connected" || localStatus === "error") {
    if (testResult) body = renderDone();
    else if (showTestStep || (busy && hasTestStep(integration))) body = renderTestStep();
    else body = renderConnectedSummary();
  } else if (
    integration.authType === "api_credentials" &&
    integration.id !== "zapier" &&
    !showDirectApi
  ) {
    body = (
      <IntegrationZapierEasyPath
        integration={integration}
        onUseDirectApi={() => setShowDirectApi(true)}
      />
    );
  } else if (integration.authType === "oauth" && !useApiKeyMode) {
    body = renderOAuthConnect();
  } else {
    body = renderCredentialFields();
  }

  const shellClass = embedded
    ? "border-t border-border bg-background"
    : "dashboard-panel overflow-hidden";

  return (
    <div className={shellClass}>
      {!embedded && (
        <div className="flex items-start justify-between gap-4 px-4 sm:px-6 py-4 border-b border-border bg-muted/10">
          <div className="flex items-center gap-3 min-w-0">
            <IntegrationIcon id={integration.id} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">Connect {integration.name}</p>
              <p className="text-xs text-muted-foreground">Setup wizard</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end px-4 sm:px-5 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Close setup
          </button>
        </div>
      )}
      <div className={embedded ? "px-4 sm:px-5 pb-5" : "p-4 sm:p-6"}>
        {connection?.last_error && localStatus !== "connected" && localStatus !== "coming_soon" && (
          <p className="text-xs text-red-600 mb-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 px-3 py-2">
            {connection.last_error}
          </p>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${integration.id}-${localStatus}-${useApiKeyMode}-${showDirectApi}-${showTestStep}-${!!testResult}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

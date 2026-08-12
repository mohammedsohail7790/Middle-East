"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Building, Clock, Bot, Check, Loader2, Hash, Phone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { api, humanizeApiError, prefetchCsrfToken } from "@/lib/api";
import { resolveOnboardingEntry } from "@/lib/ensure-tenant";
import {
  friendlyPhoneSetupError,
  isLocalDashboard,
  parsePhoneSearchResults,
  provisioningBlockedReason,
  type PhoneProvisioningStatus,
} from "@/lib/phone-setup";
import { setTenantId, setPlan } from "@/lib/store";
import { cn } from "@/lib/utils";
import { OnboardingPersonalityVoice } from "@/components/onboarding/OnboardingPersonalityVoice";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";

const FALLBACK_INDUSTRIES = [
  { id: "hvac", label: "HVAC", icon: "\u{1F321}\u{FE0F}" },
  { id: "plumbing", label: "Plumbing", icon: "\u{1F527}" },
  { id: "electrical", label: "Electrical", icon: "\u26A1" },
  { id: "real_estate", label: "Real Estate", icon: "\u{1F3E0}" },
  { id: "salon", label: "Salon / Spa", icon: "\u{1F487}" },
  { id: "law_firm", label: "Law Firm", icon: "\u2696\u{FE0F}" },
  { id: "clinic", label: "Medical Clinic", icon: "\u{1F3E5}" },
  { id: "general", label: "Other", icon: "\u{1F4CB}" },
];

interface IndustryOption {
  id: string;
  label: string;
  icon: string;
}

const TONES = [
  { id: "professional", label: "Professional", desc: "Polished and efficient" },
  { id: "friendly", label: "Friendly", desc: "Warm and casual" },
  { id: "warm", label: "Warm", desc: "Caring and patient" },
  { id: "casual", label: "Casual", desc: "Relaxed and easy-going" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toggleIndustry(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

const TOTAL_WIZARD_STEPS = 6;

interface OnboardingProgressData {
  step?: string;
  completed?: boolean;
  twilioProvisioned?: boolean;
  testCallCompleted?: boolean;
  skippedSteps?: string[];
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);

  const [areaCode, setAreaCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ phoneNumber: string; region?: string }[]>([]);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [provisionedLine, setProvisionedLine] = useState<string | null>(null);
  const [phoneStats, setPhoneStats] = useState<PhoneProvisioningStatus | null>(null);
  const [claimingFirst, setClaimingFirst] = useState(false);
  const [testCallLoading, setTestCallLoading] = useState(false);

  const [company, setCompany] = useState("");
  const [services, setServices] = useState("");
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"; }
    catch { return "America/New_York"; }
  });
  const [industries, setIndustries] = useState<string[]>([]);
  const [days, setDays] = useState(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [agentName, setAgentName] = useState("Sarah");
  const [tone, setTone] = useState("professional");
  const [industryOptions, setIndustryOptions] = useState<IndustryOption[]>(FALLBACK_INDUSTRIES);

  const canNext =
    step === 0 ? !!company.trim() : step === 1 ? industries.length > 0 : true;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSessionChecking(false);
        router.replace("/login");
        return;
      }
      try {
        await prefetchCsrfToken();
        const [entry, industriesRes] = await Promise.all([
          resolveOnboardingEntry({ maxWaitMs: 15_000 }),
          api.get<Array<{ id: string; name: string; icon?: string }>>("/tenants/industries").catch(() => null),
        ]);
        if (industriesRes && Array.isArray(industriesRes) && industriesRes.length > 0) {
          setIndustryOptions(
            industriesRes.map((ind) => ({
              id: ind.id,
              label: ind.name,
              icon: ind.icon || "\u{1F4CB}",
            }))
          );
        }
        if (cancelled) return;
        if (entry.redirectToDashboard) {
          router.replace("/dashboard");
          return;
        }
        if (entry.tenantId) {
          setCreatedTenantId(entry.tenantId);
          setTenantId(entry.tenantId);
          if (entry.resumeStep != null) setStep(entry.resumeStep);
        }
      } catch {
        if (!cancelled) {
          setError("Could not reach the server — wait 30 seconds and refresh.");
        }
      } finally {
        if (!cancelled) setSessionChecking(false);
      }
      const meta = session.user.user_metadata;
      if (typeof meta?.company_name === "string" && meta.company_name.trim()) {
        setCompany((prev) => (prev.trim() ? prev : meta.company_name));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (step !== 4 || !createdTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const [status, stats] = await Promise.all([
          api.get<{ configured?: boolean; phoneNumber?: string }>("/onboarding/twilio-status"),
          api.get<PhoneProvisioningStatus>("/phone-numbers/stats").catch(() => null),
        ]);
        if (cancelled) return;
        if (stats) setPhoneStats(stats);
        if (status?.configured && status.phoneNumber) {
          setProvisionedLine(status.phoneNumber);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, createdTenantId]);

  async function handleFinish() {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const businessHours = {
        days,
        start: startTime,
        end: endTime,
        timezone,
      };

      const displayName = agentName.trim() || "Sarah";

      let tenantId: string | null = null;
      try {
        const existing = await api.get<{ id: string }>(
          `/tenants/onboarding-status?owner_user_id=${encodeURIComponent(user.id)}`
        );
        tenantId = existing?.id ?? null;
      } catch {
        /* no workspace yet */
      }

      if (!tenantId) {
        const result = await api.post<{ id: string }>("/tenants", {
          business_name: company.trim(),
          services_offered: services.split(",").map((s) => s.trim()).filter(Boolean),
          industries,
          tone,
          language_mode: "en",
          owner_user_id: user.id,
          timezone,
          business_hours: businessHours,
          agent_name: displayName,
          voice_id: displayName.toLowerCase() === "sarah" ? "coral" : "marin",
          system_prompt: `You are ${displayName}, the AI receptionist for ${company.trim()}. Be ${tone}, helpful, and concise.`,
          capabilities: {
            bookAppointments: true,
            transferCalls: true,
            collectPayments: false,
            sendSMS: true,
            accessKnowledge: true,
          },
        });
        tenantId = result?.id ?? null;
      }

      if (!tenantId) throw new Error("Workspace was not created — try again in a moment.");

      setTenantId(tenantId);
      setPlan("trial");
      setCreatedTenantId(tenantId);
      await supabase.auth.updateUser({ data: { tenant_id: tenantId } });
      await supabase.auth.refreshSession();

      try {
        await api.post("/onboarding/progress", { step: "twilio", completed: false });
      } catch {
        /* progress is best-effort until JWT propagates */
      }

      setStep(4);
    } catch (err: unknown) {
      let message = humanizeApiError(err);
      if (/csrf|security check/i.test(message)) {
        message = "Could not save your workspace. Refresh this page and try again.";
      } else if (/tenant not configured|403/i.test(message)) {
        message = "Session error — sign out, sign in again, then retry setup.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearchNumbers() {
    const ac = areaCode.replace(/\D/g, "").slice(0, 3);
    if (ac.length !== 3) {
      setError("Enter a 3-digit US area code.");
      return;
    }
    const blocked = provisioningBlockedReason(phoneStats);
    if (blocked) {
      setError(blocked);
      return;
    }
    setSearching(true);
    setError(null);
    setSearchResults([]);

    try {
      const raw = await api.get<unknown>(`/phone-numbers/search?areaCode=${encodeURIComponent(ac)}`);
      const list = parsePhoneSearchResults(raw);
      setSearchResults(list);
      if (list.length === 0) setError("No numbers found for that area code. Try another.");
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Search failed";
      setError(friendlyPhoneSetupError(raw));
    } finally {
      setSearching(false);
    }
  }

  async function handleClaimFirstAvailable() {
    const ac = areaCode.replace(/\D/g, "").slice(0, 3);
    if (ac.length !== 3) {
      setError("Enter a 3-digit US area code first.");
      return;
    }
    const blocked = provisioningBlockedReason(phoneStats);
    if (blocked) {
      setError(blocked);
      return;
    }
    setClaimingFirst(true);
    setError(null);
    try {
      const result = await api.post<{ phoneNumber?: string }>("/onboarding/provision-phone", {
        areaCode: ac,
      });
      const line = result?.phoneNumber ? String(result.phoneNumber) : "";
      if (!line) throw new Error("No number was returned — try Search and pick a line manually.");
      setProvisionedLine(line);
      try {
        await api.post("/onboarding/progress", { twilioProvisioned: true, step: "knowledge" });
      } catch {
        /* non-fatal */
      }
      setStep(5);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Could not claim a number";
      setError(friendlyPhoneSetupError(raw));
    } finally {
      setClaimingFirst(false);
    }
  }

  async function handlePurchaseNumber(phoneNumber: string) {
    setPurchasing(phoneNumber);
    setError(null);
    try {
      await api.post("/phone-numbers/purchase", { phoneNumber });
      try {
        await api.post("/onboarding/progress", { twilioProvisioned: true, step: "knowledge" });
      } catch {
        /* non-fatal */
      }
      setProvisionedLine(phoneNumber);
      setStep(5);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Could not purchase this number";
      setError(friendlyPhoneSetupError(raw));
    } finally {
      setPurchasing(null);
    }
  }

  async function handleSkipPhoneStep() {
    setLoading(true);
    setError(null);
    try {
      await api.post("/onboarding/skip-step", { step: "twilio" });
      try {
        await api.post("/onboarding/progress", { step: "knowledge" });
      } catch {
        /* non-fatal */
      }
      setStep(5);
    } catch {
      setStep(5);
    } finally {
      setLoading(false);
    }
  }

  async function handleSkipIntegrations() {
    setLoading(true);
    setError(null);
    try {
      await api.post("/onboarding/skip-step", { step: "crm" });
      setStep(6);
    } catch {
      setStep(6);
    } finally {
      setLoading(false);
    }
  }

  async function goToDashboard() {
    setLoading(true);
    setError(null);
    try {
      const { ensureTenantSession } = await import("@/lib/ensure-tenant");
      const tenantId = createdTenantId || (await ensureTenantSession());
      if (!tenantId) {
        setError("Workspace not ready — go back and finish company setup, or sign in again.");
        return;
      }
      try {
        await api.post("/onboarding/progress", { step: "complete", completed: true });
      } catch {
        /* non-fatal */
      }
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function handleTestCall() {
    setTestCallLoading(true);
    setError(null);
    try {
      const res = await api.post<{ success?: boolean; message?: string }>("/onboarding/test-call", {});
      if (res?.success === false) {
        setError(res.message || "Test call failed");
        return;
      }
      if (res?.success) {
        try {
          await api.post("/onboarding/progress", { testCallCompleted: true });
        } catch {
          /* ignore */
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Test call failed");
    } finally {
      setTestCallLoading(false);
    }
  }

  if (sessionChecking) {
    return (
      <OnboardingShell step={0} totalSteps={TOTAL_WIZARD_STEPS}>
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-foreground-secondary">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <p className="text-sm">Loading your workspace…</p>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell step={step} totalSteps={TOTAL_WIZARD_STEPS}>
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div className="text-center mb-6">
                  <Building className="w-10 h-10 text-accent mx-auto mb-3" />
                  <h2 className="text-xl font-bold">Tell us about your business</h2>
                  <p className="text-sm text-foreground-secondary mt-1">We&apos;ll personalize your AI receptionist.</p>
                </div>
                <div>
                  <label className="text-sm text-foreground-secondary mb-1.5 block">Company name *</label>
                  <input value={company} onChange={(e) => setCompany(e.target.value)} className="input" placeholder="Rivera HVAC Services" />
                </div>
                <div>
                  <label className="text-sm text-foreground-secondary mb-1.5 block">Services (comma-separated)</label>
                  <input value={services} onChange={(e) => setServices(e.target.value)} className="input" placeholder="AC Repair, Furnace Install" />
                </div>
                <div>
                  <label className="text-sm text-foreground-secondary mb-1.5 block">Timezone</label>
                  <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="input">
                    <option value="America/New_York">Eastern</option>
                    <option value="America/Chicago">Central</option>
                    <option value="America/Denver">Mountain</option>
                    <option value="America/Los_Angeles">Pacific</option>
                  </select>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold">What industries are you in?</h2>
                  <p className="text-sm text-foreground-secondary mt-1">Select all that apply — gives your AI the right vocabulary.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {industryOptions.map((ind) => {
                    const selected = industries.includes(ind.id);
                    return (
                      <button
                        key={ind.id}
                        type="button"
                        onClick={() => setIndustries((prev) => toggleIndustry(prev, ind.id))}
                        className={cn(
                          "p-4 rounded-xl border-2 text-left transition-all",
                          selected
                            ? "border-accent bg-accent/10 ring-1 ring-accent/30"
                            : "border-border hover:border-border-light"
                        )}
                      >
                        <div className="text-2xl mb-1">{ind.icon}</div>
                        <div className="text-sm font-medium">{ind.label}</div>
                        {selected && (
                          <div className="mt-1 text-[10px] font-semibold text-accent uppercase tracking-wide">Selected</div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {industries.length > 0 && (
                  <p className="text-xs text-foreground-secondary text-center">
                    {industries.length} selected
                  </p>
                )}
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div className="text-center mb-6">
                  <Clock className="w-10 h-10 text-accent mx-auto mb-3" />
                  <h2 className="text-xl font-bold">Business hours</h2>
                  <p className="text-sm text-foreground-secondary mt-1">AI answers 24/7 but mentions after-hours.</p>
                </div>
                <div>
                  <label className="text-sm text-foreground-secondary mb-2 block">Working days</label>
                  <div className="flex gap-2 flex-wrap">
                    {DAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setDays((prev) =>
                            prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                          )
                        }
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                          days.includes(d)
                            ? "bg-primary text-white"
                            : "bg-background-hover text-foreground-secondary border border-border"
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-foreground-secondary mb-1.5 block">Start</label>
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input" />
                  </div>
                  <div>
                    <label className="text-sm text-foreground-secondary mb-1.5 block">End</label>
                    <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input" />
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div className="text-center mb-6">
                  <Bot className="w-10 h-10 text-accent mx-auto mb-3" />
                  <h2 className="text-xl font-bold">Name your AI receptionist</h2>
                  <p className="text-sm text-foreground-secondary mt-1">
                    Callers will hear this name. Name, personality, and voice can be updated anytime on
                    the dashboard <strong>AI Agent</strong> page.
                  </p>
                </div>
                <div>
                  <label className="text-sm text-foreground-secondary mb-1.5 block">Agent name</label>
                  <input value={agentName} onChange={(e) => setAgentName(e.target.value)} className="input" placeholder="Sarah" />
                </div>
                <div>
                  <label className="text-sm text-foreground-secondary mb-2 block">Personality</label>
                  <OnboardingPersonalityVoice
                    tones={TONES}
                    tone={tone}
                    agentName={agentName}
                    onToneChange={setTone}
                  />
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div key="s4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div className="text-center mb-4">
                  <Hash className="w-10 h-10 text-accent mx-auto mb-3" />
                  <h2 className="text-xl font-bold">Get your AI phone line</h2>
                  <p className="text-sm text-foreground-secondary mt-1">
                    Pick a US area code and claim a line. Calls to that number reach your AI receptionist automatically — included on your free trial (up to 3 lines).
                  </p>
                </div>

                {provisioningBlockedReason(phoneStats) && !provisionedLine && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
                    {provisioningBlockedReason(phoneStats)}
                  </div>
                )}

                {provisionedLine && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 text-center">
                    You already have <strong>{provisionedLine}</strong> on this workspace. Continue when you&apos;re ready.
                  </div>
                )}

                {isLocalDashboard() && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950 leading-relaxed">
                    <strong>Local dev:</strong> Twilio cannot reach <code className="rounded bg-white px-1">localhost</code>. Run the
                    gateway with a public URL (ngrok or Render) and set{" "}
                    <code className="rounded bg-white px-1">TWILIO_STREAM_WSS_URL</code> in{" "}
                    <code className="rounded bg-white px-1">apps/gateway/.env</code>.
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    value={areaCode}
                    onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    className="input flex-1"
                    placeholder="e.g. 212"
                    inputMode="numeric"
                    maxLength={3}
                    aria-label="Area code"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSearchNumbers()}
                    disabled={
                      searching ||
                      claimingFirst ||
                      !!purchasing ||
                      areaCode.replace(/\D/g, "").length !== 3 ||
                      !!provisioningBlockedReason(phoneStats)
                    }
                    className="btn-primary shrink-0 px-4"
                  >
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void handleClaimFirstAvailable()}
                  disabled={
                    claimingFirst ||
                    searching ||
                    !!purchasing ||
                    areaCode.replace(/\D/g, "").length !== 3 ||
                    !!provisioningBlockedReason(phoneStats)
                  }
                  className="btn-blue w-full !py-3"
                >
                  {claimingFirst ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Claiming your number…
                    </>
                  ) : (
                    <>
                      <Phone className="w-4 h-4 inline mr-2" />
                      Claim first available in this area code
                    </>
                  )}
                </button>

                {searchResults.length > 0 && (
                  <ul className="space-y-2 max-h-56 overflow-y-auto">
                    {searchResults.map((row) => (
                      <li
                        key={row.phoneNumber}
                        className="flex items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2"
                      >
                        <div className="min-w-0 text-left">
                          <div className="text-sm font-semibold truncate">{row.phoneNumber}</div>
                          {row.region && (
                            <div className="text-xs text-foreground-secondary">{row.region}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!!purchasing}
                          onClick={() => void handlePurchaseNumber(row.phoneNumber)}
                          className="btn-blue text-xs shrink-0 !py-2 !px-3"
                        >
                          {purchasing === row.phoneNumber ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Use this number"
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="text-xs text-foreground-secondary text-center">
                  Need more control?{" "}
                  <button type="button" className="text-accent font-semibold underline" onClick={() => router.push("/dashboard/phone-numbers?from=onboarding")}>
                    Open Phone Numbers
                  </button>
                </p>
              </motion.div>
            )}

            {step === 5 && (
              <motion.div key="s5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="text-center py-6 space-y-3">
                <h2 className="text-xl font-bold">Almost there</h2>
                <p className="text-foreground-secondary max-w-sm mx-auto">
                  Your workspace is ready. Continue to finish setup.
                </p>
              </motion.div>
            )}

            {step === 6 && (
              <motion.div key="s6" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6 space-y-5">
                <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold">You&apos;re all set!</h2>
                <p className="text-foreground-secondary max-w-sm mx-auto">
                  <strong>{agentName}</strong> is ready for <strong>{company}</strong>. 14-day free trial with 60 minutes.
                  {provisionedLine && (
                    <>
                      {" "}
                      Your line: <strong>{provisionedLine}</strong>
                    </>
                  )}
                </p>
                {provisionedLine && (
                  <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
                    <button
                      type="button"
                      disabled={testCallLoading}
                      onClick={() => void handleTestCall()}
                      className="btn-ghost inline-flex items-center gap-2"
                    >
                      {testCallLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                      Ring test number
                    </button>
                    <span className="text-[11px] text-foreground-secondary max-w-xs">
                      Uses <code className="text-[10px]">TEST_CALL_NUMBER</code> on the gateway (optional).
                    </span>
                  </div>
                )}
                <button type="button" onClick={() => void goToDashboard()} className="btn-primary !py-3 !px-8">
                  Go to Dashboard <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
          )}

          {step <= 3 && (
            <div className="mt-8 flex justify-between">
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                disabled={step === 0}
                className="btn-ghost !px-5 disabled:opacity-30"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canNext}
                  className="btn-primary !px-6 disabled:opacity-50"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={loading}
                  className="btn-primary !px-6 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Setting up...
                    </>
                  ) : (
                    <>
                      Launch AI Agent <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="mt-8 flex flex-wrap justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="btn-ghost !px-5"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <div className="flex gap-2">
                {provisionedLine ? (
                  <button type="button" onClick={() => setStep(5)} className="btn-primary !px-6">
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleSkipPhoneStep()}
                  disabled={loading}
                  className="btn-ghost !px-5"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Skip for now"}
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="mt-8 flex flex-wrap justify-between gap-2">
              <button type="button" onClick={() => setStep(4)} className="btn-ghost !px-5">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleSkipIntegrations()}
                  disabled={loading}
                  className="btn-ghost !px-5"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Skip for now"}
                </button>
                <button type="button" onClick={() => setStep(6)} className="btn-primary !px-6">
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
    </OnboardingShell>
  );
}

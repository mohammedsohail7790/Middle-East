"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, Sparkles, Mail } from "lucide-react";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { SUPPORT_EMAIL } from "@/lib/integration-support";
import type { TrialUsageState } from "./TrialUsageBanner";

const PLANS = [
  { id: "essential", name: "Essential", price: 39, minutes: 250 },
  { id: "professional", name: "Professional", price: 149, minutes: 750, popular: true },
];

export function TrialLockedOverlay({ trial }: { trial: TrialUsageState }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const startCheckout = async (planId: string) => {
    setLoading(planId);
    setError("");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) throw new Error("Sign in required");

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const res = await api.post<{ url: string }>("/billing/checkout-session", {
        plan: planId,
        email,
        successUrl: `${origin}/dashboard/billing?checkout=success`,
        cancelUrl: `${origin}/dashboard/billing?checkout=cancel`,
      });
      if (res?.url) window.location.href = res.url;
      else throw new Error("Checkout URL missing");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="max-w-lg w-full rounded-3xl bg-card shadow-2xl border border-border overflow-hidden">
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-8 py-10 text-center text-white">
          <div className="w-14 h-14 rounded-2xl bg-white/10 mx-auto flex items-center justify-center mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Your free trial has ended</h2>
          <p className="text-sm text-white/70 mt-2 max-w-sm mx-auto">
            {trial.blockReason ||
              "Upgrade to restore your AI receptionist, workflows, and integrations."}
          </p>
        </div>

        <div className="px-8 py-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-muted p-3 border border-border">
              <p className="text-[10px] uppercase tracking-wide text-foreground-tertiary">Minutes used</p>
              <p className="text-xl font-bold text-foreground">
                {trial.trialMinutesUsed} <span className="text-sm font-normal text-foreground-secondary">/ 60</span>
              </p>
            </div>
            <div className="rounded-xl bg-muted p-3 border border-border">
              <p className="text-[10px] uppercase tracking-wide text-foreground-tertiary">Trial period</p>
              <p className="text-xl font-bold text-foreground">14 days</p>
            </div>
          </div>

          <p className="text-xs text-foreground-secondary text-center">
            You can still view analytics and manage billing. Choose a plan to go live again.
          </p>

          {error && (
            <p className="text-xs text-red-600 text-center">{error}</p>
          )}

          <div className="space-y-2">
            {PLANS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!!loading}
                onClick={() => startCheckout(p.id)}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-border hover:border-accent/40 hover:bg-accent/5 transition-all text-left disabled:opacity-60"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className={cnIcon(p.popular)} />
                  <div>
                    <span className="text-sm font-semibold text-foreground">{p.name}</span>
                    {p.popular && (
                      <span className="ml-2 text-[10px] font-medium text-accent">Popular</span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-bold text-foreground">
                  {loading === p.id ? "…" : `$${p.price}/mo`}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Link
              href="/dashboard/billing"
              className="btn-primary flex-1 justify-center text-sm"
            >
              View billing
            </Link>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="btn-ghost flex-1 justify-center text-sm gap-2"
            >
              <Mail className="w-4 h-4" /> Contact sales
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function cnIcon(popular?: boolean) {
  return popular ? "w-4 h-4 text-accent" : "w-4 h-4 text-foreground-tertiary";
}

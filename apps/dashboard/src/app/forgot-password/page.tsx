"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { supabase } from "@/lib/supabase";
import { getSiteUrl } from "@/lib/site-url";
import {
  AuthCard,
  AuthError,
  AuthNotice,
  AuthPageShell,
  AuthPasswordInput,
} from "@/components/auth/AuthPageShell";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Recovery mode: user arrived from the email reset link with a live session.
  const [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const redirectTo = `${getSiteUrl()}/forgot-password`;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setUpdated(true);
    window.setTimeout(() => router.replace("/dashboard"), 1200);
  }

  if (recovery) {
    return (
      <AuthPageShell>
        <AuthCard
          title="Set a new password"
          description={updated ? "Password updated — taking you to your dashboard." : "Choose a new password for your account."}
        >
          {updated ? (
            <div className="mt-6">
              <AuthNotice message="Your password has been changed." />
            </div>
          ) : (
            <form onSubmit={handleUpdatePassword} className="mt-6 space-y-4">
              <div>
                <label className="auth-label" htmlFor="new-password">
                  New password
                </label>
                <AuthPasswordInput
                  id="new-password"
                  name="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  withLockIcon
                />
              </div>
              <div>
                <label className="auth-label" htmlFor="confirm-password">
                  Confirm new password
                </label>
                <AuthPasswordInput
                  id="confirm-password"
                  name="confirm"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  withLockIcon
                />
              </div>
              {error && <AuthError message={error} />}
              <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </AuthCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <AuthCard
        title="Reset your password"
        description={
          sent
            ? "Check your inbox for a reset link."
            : "Enter your email and we'll send a reset link."
        }
      >
        {sent ? (
          <Link href="/login" className="auth-btn auth-btn-primary mt-6 max-w-full">
            Back to login
          </Link>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="auth-label" htmlFor="forgot-email">
                Email
              </label>
              <div className="relative mt-1.5">
                <Mail className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--gray-400)] pointer-events-none" strokeWidth={ICON_STROKE} />
                <input
                  id="forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input !pl-10"
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </div>
            </div>
            {error && <AuthError message={error} />}
            <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
            <p className="text-center text-sm auth-muted">
              <Link href="/login" className="auth-link">
                Back to login
              </Link>
            </p>
          </form>
        )}
      </AuthCard>
    </AuthPageShell>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Mail } from "lucide-react";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import {
  AuthCard,
  AuthError,
  AuthFooterLink,
  AuthPageShell,
  AuthPasswordInput,
} from "@/components/auth/AuthPageShell";
import { supabase } from "@/lib/supabase";
import { resolvePostAuthPath, tenantIdFromSession } from "@/lib/ensure-tenant";
import { getTenantId, setTenantId } from "@/lib/store";
import { fetchDashboardBootstrap, warmGateway, warmGatewayWhenReady } from "@/lib/dashboard-bootstrap";
import { navigateAfterSignIn } from "@/lib/auth-navigate";
import { useGuestAuthRedirect } from "@/lib/use-auth-redirect";

export default function LoginPage() {
  const router = useRouter();
  useGuestAuthRedirect();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    warmGateway();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email: fd.get("email") as string,
        password: fd.get("password") as string,
      });

      if (err) {
        setError(err.message);
        return;
      }

      if (!data.session) {
        setError("Sign-in succeeded but no session was created. Confirm your email, then try again.");
        return;
      }

      const knownTenant = tenantIdFromSession(data.session);
      if (knownTenant) {
        setTenantId(knownTenant);
        await Promise.race([
          warmGatewayWhenReady().then(() => fetchDashboardBootstrap(knownTenant)),
          new Promise<void>((resolve) => window.setTimeout(resolve, 3_000)),
        ]);
        navigateAfterSignIn(router, "/dashboard");
        return;
      }

      const path = await resolvePostAuthPath(data.session, { maxWaitMs: 3_000 });
      if (path === "/dashboard") {
        const tid = getTenantId();
        if (tid) {
          await Promise.race([
            warmGatewayWhenReady().then(() => fetchDashboardBootstrap(tid)),
            new Promise<void>((resolve) => window.setTimeout(resolve, 3_000)),
          ]);
        }
      }
      navigateAfterSignIn(router, path);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  const oauthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (oauthTimerRef.current) clearTimeout(oauthTimerRef.current);
    };
  }, []);

  async function handleOAuth(provider: "google" | "azure") {
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: provider === "azure" ? "email profile openid" : undefined,
        },
      });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      oauthTimerRef.current = setTimeout(() => {
        setLoading(false);
        setError("OAuth redirect timed out. Please try again.");
      }, 10_000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "OAuth sign-in failed");
      setLoading(false);
    }
  }

  return (
    <AuthPageShell>
      <AuthCard
        title="Welcome back"
        description="Sign in to your Halla AI workspace"
      >
        {/* Social login */}
        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => void handleOAuth("google")}
            disabled={loading}
            className="auth-btn-social"
            data-loading={loading}
          >
            {loading
              ? <span className="auth-spinner auth-spinner--sm" aria-hidden />
              : (
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              )}
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => void handleOAuth("azure")}
            disabled={loading}
            className="auth-btn-social"
            data-loading={loading}
          >
            {loading
              ? <span className="auth-spinner auth-spinner--sm" aria-hidden />
              : (
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 23 23">
                  <path fill="#f3f3f3" d="M0 0h23v23H0z" />
                  <path fill="#f35325" d="M1 1h10v10H1z" />
                  <path fill="#81bc06" d="M12 1h10v10H12z" />
                  <path fill="#05a6f0" d="M1 12h10v10H1z" />
                  <path fill="#ffba08" d="M12 12h10v10H12z" />
                </svg>
              )}
            Continue with Microsoft
          </button>
        </div>

        <div className="auth-divider">or continue with email</div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="auth-label" htmlFor="login-email">
              Email
            </label>
            <div className="relative mt-1.5">
              <Mail
                className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--gray-400)] pointer-events-none"
                strokeWidth={ICON_STROKE}
              />
              <input
                id="login-email"
                name="email"
                type="email"
                required
                placeholder="you@company.com"
                className="input !pl-10"
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label className="auth-label" htmlFor="login-password">
              Password
            </label>
            <AuthPasswordInput
              id="login-password"
              name="password"
              required
              placeholder="Password"
              autoComplete="current-password"
              withLockIcon
            />
          </div>

          <div className="text-xs text-right">
            <Link href="/forgot-password" className="auth-link">
              Forgot password?
            </Link>
          </div>

          {error && <AuthError message={error} />}

          <button
            type="submit"
            className="auth-btn auth-btn-primary auth-btn-loading mt-1"
            disabled={loading}
            data-loading={loading}
          >
            {loading ? (
              <>
                <span className="auth-spinner" aria-hidden />
                Signing in…
              </>
            ) : "Sign in"}
          </button>
        </form>

        <AuthFooterLink prompt="New here?" href="/signup" linkLabel="Create a free account" />
      </AuthCard>
    </AuthPageShell>
  );
}

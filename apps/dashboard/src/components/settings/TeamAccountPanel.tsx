"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Mail, UserPlus, Users } from "lucide-react";
import { api, asArray } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { getClientAuthOrigin, buildAuthCallbackUrlFromOrigin } from "@/lib/auth-redirect";
import { useDashboardSync } from "@/lib/dashboard-sync";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";

type TeamMemberRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
};

const ROLE_KEYS = { admin: "teamRoleAdmin", agent: "teamRoleAgent", viewer: "teamRoleViewer" } as const;

export function TeamAccountPanel() {
  const t = useTranslations("pages.settings");
  const roleLabel = (role: string) => (role in ROLE_KEYS ? t(ROLE_KEYS[role as keyof typeof ROLE_KEYS]) : role);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [inviting, setInviting] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadTeam = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const rows = await api.get<TeamMemberRow[]>("/team");
      setMembers(asArray(rows));
      setError("");
    } catch (e) {
      if (!opts?.silent) {
        setError(e instanceof Error ? e.message : t("teamLoadFailed"));
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadTeam();
    void supabase.auth.getUser().then(({ data }) => {
      setAccountEmail(data.user?.email ?? "");
    });

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("email") === "confirmed") {
        setMessage(t("accountEmailConfirmed"));
        params.delete("email");
        const url = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
        window.history.replaceState({}, "", url);
      }
    }
  }, [loadTeam, t]);

  useDashboardSync(["team"], () => {
    void loadTeam({ silent: true });
  });

  const sendInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) {
      setError(t("teamNeedFields"));
      return;
    }
    setInviting(true);
    setError("");
    setMessage("");
    try {
      const res = await api.post<{ member?: TeamMemberRow; message?: string }>(
        "/team/invite",
        { email: inviteEmail.trim(), name: inviteName.trim(), role: inviteRole }
      );
      setMessage(
        res.message || t("teamInviteSent")
      );
      setInviteEmail("");
      setInviteName("");
      await loadTeam({ silent: true });
      syncDashboardAction("team");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("teamInviteFailed"));
    } finally {
      setInviting(false);
    }
  };

  const requestEmailChange = async () => {
    const next = newEmail.trim();
    if (!next || !next.includes("@")) {
      setError(t("accountEmailInvalid"));
      return;
    }
    setEmailBusy(true);
    setError("");
    setMessage("");
    try {
      const redirectTo = buildAuthCallbackUrlFromOrigin(getClientAuthOrigin(), "/dashboard/settings");
      const { error: updateErr } = await supabase.auth.updateUser(
        { email: next },
        { emailRedirectTo: redirectTo }
      );
      if (updateErr) throw updateErr;
      setMessage(t("accountEmailLinkSent", { email: next }));
      setNewEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("accountEmailFailed"));
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <div className="space-y-8 min-w-0">
      {message && (
        <div className="dashboard-alert border-emerald-200 bg-emerald-50 text-emerald-800">
          <p className="text-sm">{message}</p>
        </div>
      )}
      {error && (
        <div className="dashboard-alert dashboard-alert-error" role="alert">
          <p className="text-sm">{error}</p>
        </div>
      )}

      <section className="dashboard-panel-padded space-y-4">
        <SectionHeader
          icon={Users}
          iconVariant="violet"
          title={t("teamTitle")}
          description={t("teamDesc")}
        />

        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <EmptyState icon={Users} title={t("teamEmptyTitle")} description={t("teamEmptyDesc")} />
        ) : (
          <ul className="dashboard-panel overflow-hidden divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="dashboard-list-row !py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate text-sm">{m.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{m.email}</p>
                </div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0 badge-neutral px-2 py-0.5 rounded-full">
                  {roleLabel(m.role)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-2 pt-2">
          <input
            type="text"
            className="input"
            placeholder={t("teamFullName")}
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
          />
          <input
            type="email"
            className="input"
            placeholder={t("teamInviteEmail")}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <select
            className="input sm:col-span-1"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
          >
            <option value="admin">{t("teamRoleAdmin")}</option>
            <option value="agent">{t("teamRoleAgent")}</option>
            <option value="viewer">{t("teamRoleViewer")}</option>
          </select>
          <button
            type="button"
            className={cn("btn-primary sm:col-span-1 justify-center", inviting && "opacity-70")}
            disabled={inviting}
            onClick={() => void sendInvite()}
          >
            <UserPlus className="w-4 h-4" strokeWidth={ICON_STROKE} />
            {inviting ? t("teamSending") : t("teamSendInvite")}
          </button>
        </div>
      </section>

      <section className="dashboard-panel-padded space-y-4">
        <SectionHeader
          icon={Mail}
          iconVariant="muted"
          title={t("accountEmailTitle")}
          description={t("accountEmailDesc")}
        />
        <p className="text-sm">
          {t("accountCurrent")} <strong>{accountEmail || "—"}</strong>
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            className="input w-full sm:flex-1 min-w-0"
            placeholder={t("accountNewEmail")}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            autoComplete="email"
          />
          <button
            type="button"
            className="btn-secondary shrink-0 w-full sm:w-auto justify-center"
            disabled={emailBusy}
            onClick={() => void requestEmailChange()}
          >
            {emailBusy ? t("teamSending") : t("accountChangeEmail")}
          </button>
        </div>
      </section>
    </div>
  );
}

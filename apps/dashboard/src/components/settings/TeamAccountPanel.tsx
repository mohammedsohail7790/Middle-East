"use client";

import { useCallback, useEffect, useState } from "react";
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

export function TeamAccountPanel() {
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
        setError(e instanceof Error ? e.message : "Could not load team");
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeam();
    void supabase.auth.getUser().then(({ data }) => {
      setAccountEmail(data.user?.email ?? "");
    });

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("email") === "confirmed") {
        setMessage("Your new email address is confirmed.");
        params.delete("email");
        const url = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
        window.history.replaceState({}, "", url);
      }
    }
  }, [loadTeam]);

  useDashboardSync(["team"], () => {
    void loadTeam({ silent: true });
  });

  const sendInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) {
      setError("Email and name are required to invite.");
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
        res.message || "Invitation sent — they will receive the Halla AI invite email."
      );
      setInviteEmail("");
      setInviteName("");
      await loadTeam({ silent: true });
      syncDashboardAction("team");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  };

  const requestEmailChange = async () => {
    const next = newEmail.trim();
    if (!next || !next.includes("@")) {
      setError("Enter a valid new email address.");
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
      setMessage(
        `We sent a confirmation link to ${next}. Your login email updates after you confirm (Halla AI "Change email" template).`
      );
      setNewEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start email change");
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
          title="Team"
          description='Invites use your Supabase "Invite user" email template. When they accept, they are linked to this workspace automatically.'
        />

        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <EmptyState icon={Users} title="No team members yet" description="Invite colleagues to share this workspace." />
        ) : (
          <ul className="dashboard-panel overflow-hidden divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="dashboard-list-row !py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate text-sm">{m.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{m.email}</p>
                </div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0 badge-neutral px-2 py-0.5 rounded-full">
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-2 pt-2">
          <input
            type="text"
            className="input"
            placeholder="Full name"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
          />
          <input
            type="email"
            className="input"
            placeholder="Email to invite"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <select
            className="input sm:col-span-1"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
          >
            <option value="admin">Admin</option>
            <option value="agent">Agent</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            type="button"
            className={cn("btn-primary sm:col-span-1 justify-center", inviting && "opacity-70")}
            disabled={inviting}
            onClick={() => void sendInvite()}
          >
            <UserPlus className="w-4 h-4" strokeWidth={ICON_STROKE} />
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </div>
      </section>

      <section className="dashboard-panel-padded space-y-4">
        <SectionHeader
          icon={Mail}
          iconVariant="muted"
          title="Account email"
          description='Changing email uses the Supabase "Change email address" template. After you confirm, your workspace team record syncs on the next login.'
        />
        <p className="text-sm">
          Current: <strong>{accountEmail || "—"}</strong>
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            className="input flex-1 min-w-0"
            placeholder="New email address"
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
            {emailBusy ? "Sending…" : "Change email"}
          </button>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { HelpCircle, MessageSquare, Mail, ExternalLink, ChevronDown, ChevronUp, Send } from "lucide-react";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { DashboardPageSection } from "@/components/ui-kit/DashboardPageSection";
import { VibePanel } from "@/components/magic-ui/vibe-panel";
import { SupportQuickLink } from "@/components/support/SupportQuickLink";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { showDashboardToast } from "@/lib/dashboard-toast";
import { SUPPORT_EMAIL, HELP_SETUP_HREF } from "@/lib/integration-support";
import { useDashboardPageLabels } from "@/lib/use-dashboard-page-labels";

const FAQ_KEYS = [
  "phoneNumber",
  "localNumber",
  "crm",
  "notAnswering",
  "changeAi",
  "transfer",
  "team",
] as const;

export default function SupportPage() {
  const t = useTranslations("support");
  const tShell = useTranslations("shell");
  const { title, description } = useDashboardPageLabels("/dashboard/support");
  const faqs = FAQ_KEYS.map((key) => ({
    q: t(`faqs.${key}.q`),
    a: t(`faqs.${key}.a`),
  }));
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [ticket, setTicket] = useState({ subject: "", message: "", email: "" });
  const [sent, setSent] = useState(false);

  const submitTicket = () => {
    if (!ticket.subject.trim() || !ticket.message.trim() || !ticket.email.trim()) {
      showDashboardToast({ type: "error", title: tShell("couldNotLoad"), message: t("missingFields") });
      return;
    }
    const replyEmail = ticket.email;
    const body = `From: ${replyEmail}\n\n${ticket.message}`;
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(ticket.subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, "_blank");
    setSent(true);
    setTicket({ subject: "", message: "", email: replyEmail });
    showDashboardToast({
      type: "success",
      title: t("emailOpened"),
      message: t("emailOpenedDesc"),
      durationMs: 6000,
    });
  };

  return (
    <DashboardPage
      title={title}
      description={description}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SupportQuickLink
          href={`mailto:${SUPPORT_EMAIL}`}
          external
          icon={Mail}
          title={t("emailSupport")}
          description={SUPPORT_EMAIL}
          iconVariant="accent"
        />
        <SupportQuickLink
          href={`mailto:${SUPPORT_EMAIL}?subject=Halla%20AI%20Support`}
          external
          icon={MessageSquare}
          title="Open Email Client"
          description="We reply within 24 hours"
          iconVariant="violet"
        />
        <SupportQuickLink
          href={HELP_SETUP_HREF}
          icon={ExternalLink}
          title="Setup guide"
          description="Step-by-step onboarding walkthrough"
          iconVariant="neutral"
        />
      </div>

      <DashboardPageSection
        title={t("faqTitle")}
        icon={HelpCircle}
        iconVariant="accent"
      >
        <VibePanel className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
          <div className="divide-y divide-border px-4 sm:px-5">
            {faqs.map((faq, i) => (
              <div key={i} className="vibe-faq-row py-3">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
                >
                  <p className="text-sm font-medium text-foreground">{faq.q}</p>
                  {openFaq === i
                    ? <ChevronUp className="size-4 shrink-0 text-muted-foreground" strokeWidth={ICON_STROKE} />
                    : <ChevronDown className="size-4 shrink-0 text-muted-foreground" strokeWidth={ICON_STROKE} />}
                </button>
                {openFaq === i && (
                  <p className="mt-2 pl-0 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
                )}
              </div>
            ))}
          </div>
        </VibePanel>
      </DashboardPageSection>

      {!sent ? (
        <DashboardPageSection
          title={t("ticketTitle")}
          icon={Mail}
          iconVariant="violet"
          description="This opens your email client to send a message to our support team."
        >
          <VibePanel beam className="rounded-2xl border border-border/70 bg-card shadow-card">
            <div className="space-y-4 p-5 sm:p-6">
              <div>
                <label htmlFor="support-email" className="dashboard-field-label">Your email *</label>
                <input
                  id="support-email"
                  type="email"
                  value={ticket.email}
                  onChange={(e) => setTicket((t) => ({ ...t, email: e.target.value }))}
                  placeholder="you@company.com"
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="support-subject" className="dashboard-field-label">Subject *</label>
                <input
                  id="support-subject"
                  type="text"
                  value={ticket.subject}
                  onChange={(e) => setTicket((t) => ({ ...t, subject: e.target.value }))}
                  placeholder="Brief description of your issue"
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="support-message" className="dashboard-field-label">Message *</label>
                <textarea
                  id="support-message"
                  rows={5}
                  value={ticket.message}
                  onChange={(e) => setTicket((t) => ({ ...t, message: e.target.value }))}
                  placeholder="Describe the issue in detail — what you expected vs. what happened, any error messages, etc."
                  className="input resize-none"
                />
              </div>
              <button
                type="button"
                onClick={() => submitTicket()}
                disabled={!ticket.subject.trim() || !ticket.message.trim() || !ticket.email.trim()}
                className="btn-primary w-full sm:w-auto"
              >
                <Send className="size-4" strokeWidth={ICON_STROKE} />
                Open Email Client
              </button>
            </div>
          </VibePanel>
        </DashboardPageSection>
      ) : (
        <DashboardPageSection title="Check Your Email" icon={Mail} iconVariant="success">
          <VibePanel className="rounded-2xl border border-border/70 bg-card shadow-card">
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Your email client should have opened with the support message. If it didn&apos;t, email us directly at{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-foreground underline underline-offset-2 hover:text-accent-foreground">
                  {SUPPORT_EMAIL}
                </a>
              </p>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setTicket({ subject: "", message: "", email: "" });
                }}
                className="btn-ghost mt-4 text-sm"
              >
                Send another email
              </button>
            </div>
          </VibePanel>
        </DashboardPageSection>
      )}
    </DashboardPage>
  );
}

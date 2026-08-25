"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { HelpCircle, MessageSquare, Mail, ExternalLink, ChevronDown, ChevronUp, Send } from "lucide-react";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { DashboardPageSection } from "@/components/ui-kit/DashboardPageSection";
import { IconBox, ICON_STROKE } from "@/components/ui-kit/IconBox";
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
      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="wb-panel-padded card-hover flex items-center gap-4"
        >
          <IconBox icon={Mail} variant="accent" size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{t("emailSupport")}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{SUPPORT_EMAIL}</p>
          </div>
        </a>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Halla%20AI%20Support`}
          className="wb-panel-padded card-hover flex items-center gap-4"
        >
          <IconBox icon={MessageSquare} variant="violet" size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Open Email Client</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">We reply within 24 hours</p>
          </div>
        </a>
        <Link
          href={HELP_SETUP_HREF}
          className="wb-panel-padded card-hover flex items-center gap-4"
        >
          <IconBox icon={ExternalLink} variant="neutral" size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Setup guide</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">Step-by-step onboarding walkthrough</p>
          </div>
        </Link>
      </div>

      {/* FAQs */}
      <DashboardPageSection
        title={t("faqTitle")}
        icon={HelpCircle}
        iconVariant="accent"
      >
        <div className="divide-y divide-border">
          {faqs.map((faq, i) => (
            <div key={i} className="py-3">
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                aria-expanded={openFaq === i}
                className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
              >
                <p className="text-sm font-medium text-foreground">{faq.q}</p>
                {openFaq === i
                  ? <ChevronUp className="size-4 text-muted-foreground shrink-0" strokeWidth={ICON_STROKE} />
                  : <ChevronDown className="size-4 text-muted-foreground shrink-0" strokeWidth={ICON_STROKE} />}
              </button>
              {openFaq === i && (
                <p className="text-sm text-muted-foreground mt-2 pl-0 leading-relaxed">{faq.a}</p>
              )}
            </div>
          ))}
        </div>
      </DashboardPageSection>

      {/* Support ticket */}
      {!sent ? (
        <DashboardPageSection
          title={t("ticketTitle")}
          icon={Mail}
          iconVariant="violet"
          description="This opens your email client to send a message to our support team."
        >
          <div className="space-y-4">
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
        </DashboardPageSection>
      ) : (
        <DashboardPageSection title="Check Your Email" icon={Mail} iconVariant="success">
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">
              Your email client should have opened with the support message. If it didn&apos;t, email us directly at{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-foreground font-medium underline underline-offset-2 hover:text-accent-foreground">
                {SUPPORT_EMAIL}
              </a>
            </p>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setTicket({ subject: "", message: "", email: "" });
              }}
              className="btn-ghost text-sm mt-4"
            >
              Send another email
            </button>
          </div>
        </DashboardPageSection>
      )}
    </DashboardPage>
  );
}

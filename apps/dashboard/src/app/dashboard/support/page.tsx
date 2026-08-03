"use client";

import { useState } from "react";
import Link from "next/link";
import { HelpCircle, MessageSquare, Mail, ExternalLink, ChevronDown, ChevronUp, Send } from "lucide-react";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { DashboardPageSection } from "@/components/ui-kit/DashboardPageSection";
import { IconBox, ICON_STROKE } from "@/components/ui-kit/IconBox";
import { showDashboardToast } from "@/lib/dashboard-toast";
import { SUPPORT_EMAIL, HELP_SETUP_HREF } from "@/lib/integration-support";
const FAQS = [
  {
    q: "How do I connect my phone number?",
    a: "Go to Phone Numbers in the sidebar and click 'Add Number'. Search by area code and purchase — it activates instantly.",
  },
  {
    q: "How do I connect my CRM (HubSpot, Salesforce, etc.)?",
    a: "Go to Integrations. For HubSpot and Salesforce use the Direct OAuth section. For Pipedrive, Zoho, and others use the Zapier webhook — it works with 5,000+ apps.",
  },
  {
    q: "Why isn't my AI agent answering calls?",
    a: "Check Phone Numbers to make sure a number is purchased and active. Check AI Agent settings to confirm the greeting and services are configured. The gateway logs any errors in Ops.",
  },
  {
    q: "How do I change what the AI says?",
    a: "Go to AI Agent and update the greeting, services, tone, and custom instructions. Changes apply to the next call — no restart needed.",
  },
  {
    q: "Can I transfer calls to a human?",
    a: "Yes. Set a Transfer Number in Settings or AI Agent. The AI will transfer when the caller requests a human or the call handling mode is set to 'transfer'.",
  },
  {
    q: "How do I add my team?",
    a: "Go to Team and click Invite Member. Enter their email and role — they'll receive an invite link.",
  },
];

export default function SupportPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [ticket, setTicket] = useState({ subject: "", message: "", email: "" });
  const [sent, setSent] = useState(false);

  const submitTicket = () => {
    if (!ticket.subject.trim() || !ticket.message.trim() || !ticket.email.trim()) {
      showDashboardToast({ type: "error", title: "Missing fields", message: "Subject, email and message are required." });
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
      title: "Email client opened",
      message: "Send the pre-filled email to reach our support team. We reply within 24 hours.",
      durationMs: 6000,
    });
  };

  return (
    <DashboardPage
      title="Support"
      description="Get help, browse FAQs, or submit a support ticket."
    >
      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="wb-panel-padded card-hover flex items-center gap-4"
        >
          <IconBox icon={Mail} variant="accent" size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Email support</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{SUPPORT_EMAIL}</p>
          </div>
        </a>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Call%20IQ%20Support`}
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
        title="Frequently Asked Questions"
        icon={HelpCircle}
        iconVariant="accent"
      >
        <div className="divide-y divide-border">
          {FAQS.map((faq, i) => (
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
          title="Email Support"
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

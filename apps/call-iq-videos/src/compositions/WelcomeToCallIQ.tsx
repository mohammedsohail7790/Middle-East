import { TrainingVideo } from "../training/TrainingVideo";
import { buildChapters } from "../training/buildChapters";
import {
  agents,
  multiTenantExamples,
  northline,
  reportingPeriod,
} from "../data/demo";
import { FeatureScreen } from "../training/screens/FeatureScreen";
import { WelcomeScreen } from "../training/screens/WelcomeScreen";

const TOTAL_FRAMES = 4500;

export const WelcomeToCallIQ: React.FC = () => {
  const chapters = buildChapters(TOTAL_FRAMES, [
    {
      title: "Welcome",
      narration:
        "Welcome to Call IQ — the AI voice receptionist built for home service businesses that never want to miss a lead.",
      content: <WelcomeScreen />,
    },
    {
      title: "What Call IQ Solves",
      narration:
        "Every missed call is lost revenue. When your crew is on a job site, Call IQ answers instantly, qualifies callers, and books appointments — around the clock.",
      content: (
        <FeatureScreen
          headline="Never miss another opportunity"
          icon="📞"
          bullets={[
            "Answers every inbound call with natural AI voice in under 2 seconds",
            "Captures leads while technicians are in the field",
            "Books appointments without back-and-forth texts or voicemails",
          ]}
          stat={{ label: "Calls missed after hours (industry avg.)", value: "62%" }}
        />
      ),
    },
    {
      title: "AI Voice Agents",
      narration:
        "Configure intelligent voice agents that sound human, pull answers from your knowledge base, and hand off to your team when it matters.",
      content: (
        <FeatureScreen
          headline="Natural AI voice agents"
          icon="🤖"
          bullets={[
            "Six premium voices — shimmer, cedar, coral, and more",
            "Context-aware responses from PDFs, websites, and FAQs",
            "Seamless transfer to dispatch or sales on escalation",
          ]}
        />
      ),
      lowerThird: {
        label: `AI Voice Agent — ${agents.northline.name}`,
        detail: `${agents.northline.voiceLabel}`,
      },
    },
    {
      title: "Lead Management",
      narration:
        "Every caller is scored, tagged, and synced to your dashboard — Maria's kitchen leak, David's AC issue, Jennifer's panel upgrade — ready for follow-up.",
      content: (
        <FeatureScreen
          headline="Instant lead capture"
          icon="👥"
          bullets={[
            "Auto-qualify with custom questions per service line",
            "Lead scoring from conversation signals and urgency",
            "Real-time sync to HubSpot, Salesforce, or Zoho",
          ]}
          stat={{ label: "Avg. lead capture rate", value: "94%" }}
        />
      ),
    },
    {
      title: "Call Analytics",
      narration:
        "Track 1,284 calls this month with 96% answer rate. See conversion trends, agent performance, and cost savings in one executive dashboard.",
      content: (
        <FeatureScreen
          headline="Real-time call analytics"
          icon="📊"
          bullets={[
            "Total calls, missed calls, and conversion tracking",
            "Per-agent satisfaction and escalation rates",
            "Exportable PDF reports for leadership reviews",
          ]}
          stat={{ label: "Reporting period", value: reportingPeriod.label }}
        />
      ),
    },
    {
      title: "Appointment Booking",
      narration:
        "Call IQ checks Google Calendar or Outlook availability and books on the spot — like Maria's 2:30 PM plumbing visit or David's AC diagnostic at 3:30.",
      content: (
        <FeatureScreen
          headline="Automated appointment booking"
          icon="📅"
          bullets={[
            "Syncs with Google Calendar and Microsoft Outlook",
            "Sends confirmation SMS with tech name and window",
            "Handles rescheduling and cancellation requests",
          ]}
        />
      ),
    },
    {
      title: "CRM Automation",
      narration:
        "Every call outcome triggers CRM updates — contacts created in HubSpot, deals moved in Salesforce, call notes logged automatically.",
      content: (
        <FeatureScreen
          headline="CRM automation built in"
          icon="🔗"
          bullets={[
            "HubSpot, Salesforce, and Zoho native integrations",
            "Auto-create contacts and log full transcripts",
            "Webhooks to ServiceTitan, Slack, and custom tools",
          ]}
        />
      ),
    },
    {
      title: "Multi-tenant Management",
      narration:
        "Agencies and multi-location operators manage isolated orgs — separate numbers, agents, and billing — from one admin console.",
      content: (
        <FeatureScreen
          headline="Built for agencies & multi-location"
          icon="🏢"
          bullets={[
            "Isolated orgs with separate phone numbers and KBs",
            "Per-tenant AI agent configuration",
            "Role-based access for owners, dispatch, and billing",
          ]}
        />
      ),
      lowerThird: {
        label: "Multi-Tenant",
        detail: multiTenantExamples.join(" · "),
      },
    },
    {
      title: "End Benefits",
      narration:
        `${northline.dba} saves over $3,000 monthly versus a full-time receptionist while capturing 49% more qualified leads. Start your free trial at calliqlabs.com.`,
      content: (
        <FeatureScreen
          headline="Smart • Seamless • Always"
          icon="✨"
          bullets={[
            "Never miss a call — 24/7 AI coverage",
            "Capture more leads with auto-qualification",
            "Save 12+ hours weekly on manual follow-ups",
          ]}
          stat={{ label: "Monthly savings", value: "$3,051" }}
        />
      ),
    },
  ]);

  return (
    <TrainingVideo
      config={{ title: "Welcome to Call IQ", videoId: "WelcomeToCallIQ", chapters, totalFrames: TOTAL_FRAMES }}
    />
  );
};

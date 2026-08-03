import { TrainingVideo } from "../training/TrainingVideo";
import { buildChapters } from "../training/buildChapters";
import { summit } from "../data/demo";
import { AgentConfigScreen } from "../training/screens/AgentConfigScreen";

const TOTAL_FRAMES = 27000;
const cfg = summit.agentConfig;
const kb = summit.knowledgeBase;

export const AIAgentConfiguration: React.FC = () => {
  const chapters = buildChapters(TOTAL_FRAMES, [
    {
      title: "Agent Creation",
      narration:
        `Marcus Chen at ${summit.dba} creates an HVAC receptionist named Morgan — inbound type, cedar voice, calm and knowledgeable tone.`,
      content: (
        <AgentConfigScreen
          section="Create AI Agent"
          tabs={["General", "Voice", "Advanced"]}
          activeTab="General"
          fields={[
            { label: "Agent Name", value: cfg.agentName },
            { label: "Agent Type", value: "Inbound Receptionist", type: "select" },
            { label: "Voice", value: cfg.voiceLabel, type: "select" },
            { label: "Language", value: "English (US)", type: "select" },
          ]}
        />
      ),
      lowerThird: {
        label: `New Agent — ${cfg.agentName}`,
        detail: `Inbound Receptionist · ${cfg.voiceLabel}`,
      },
    },
    {
      title: "Knowledge Base — PDFs",
      narration:
        "Upload service guides, maintenance plan pricing, warranty policies, and financing sheets. Call IQ indexes every page for RAG during live calls.",
      content: (
        <AgentConfigScreen
          section="Knowledge Base"
          tabs={["Documents", "Website", "FAQs"]}
          activeTab="Documents"
          fields={kb.documents.map((doc) => ({
            label: doc.filename,
            value: `${doc.pages} pages · ${doc.category}`,
          }))}
        />
      ),
    },
    {
      title: "Knowledge Base — Website Crawl",
      narration:
        `Point Call IQ at ${summit.website}. It crawled 52 pages — services, service areas, and seasonal promotions — synced every Monday.`,
      content: (
        <AgentConfigScreen
          section="Website Crawl"
          tabs={["Documents", "Website", "FAQs"]}
          activeTab="Website"
          fields={[
            { label: "Website URL", value: summit.website },
            { label: "Pages Indexed", value: `${kb.websiteCrawl.pagesIndexed} pages crawled` },
            { label: "Last Synced", value: "Today at 9:22 AM" },
            { label: "Crawl Schedule", value: kb.websiteCrawl.schedule, type: "select" },
          ]}
        />
      ),
    },
    {
      title: "Knowledge Base — FAQs",
      narration:
        "Add approved FAQ answers for hours, brands serviced, tune-up pricing, service areas, and financing — Morgan uses these as source of truth.",
      content: (
        <AgentConfigScreen
          section="FAQs"
          tabs={["Documents", "Website", "FAQs"]}
          activeTab="FAQs"
          fields={kb.faqs.slice(0, 3).map((faq) => ({
            label: `Q: ${faq.question}`,
            value: `A: ${faq.answer}`,
            type: "textarea" as const,
          }))}
        />
      ),
    },
    {
      title: "Personality — Tone & Greeting",
      narration:
        "Set Morgan's calm, knowledgeable tone and craft the opening greeting callers hear on every inbound call.",
      content: (
        <AgentConfigScreen
          section="Personality"
          tabs={["Tone", "Greeting", "Instructions"]}
          activeTab="Greeting"
          fields={[
            { label: "Tone", value: cfg.tone, type: "select" },
            { label: "Opening Greeting", value: cfg.greeting, type: "textarea" },
            {
              label: "Closing Message",
              value: "Thanks for calling Summit Comfort HVAC. Stay comfortable!",
              type: "textarea",
            },
          ]}
        />
      ),
    },
    {
      title: "Personality — Instructions",
      narration:
        "Core instructions tell Morgan to collect address and callback number, prioritize no-cool emergencies, and never quote exact replacement prices.",
      content: (
        <AgentConfigScreen
          section="Agent Instructions"
          tabs={["Tone", "Greeting", "Instructions"]}
          activeTab="Instructions"
          fields={[
            { label: "Core Instructions", value: cfg.coreInstructions, type: "textarea" },
            {
              label: "Escalation Triggers",
              value: cfg.escalationKeywords,
              type: "textarea",
            },
          ]}
        />
      ),
    },
    {
      title: "Business Rules — Hours",
      narration:
        "Configure Boulder business hours and after-hours emergency dispatch — $89 trip fee for no-heat and no-cool emergencies.",
      content: (
        <AgentConfigScreen
          section="Business Hours"
          tabs={["Hours", "Escalation", "Transfer", "Appointments"]}
          activeTab="Hours"
          fields={[
            { label: "Business Hours", value: summit.businessHours.weekdays },
            { label: "Saturday", value: summit.businessHours.saturday },
            { label: "After Hours", value: summit.businessHours.afterHours, type: "select" },
            { label: "Holiday Schedule", value: "Use default US holidays + custom closures" },
          ]}
        />
      ),
    },
    {
      title: "Business Rules — Escalation",
      narration:
        "Escalate on keywords like manager, warranty dispute, or legal inquiry. Notify dispatch via SMS and email when sentiment turns negative.",
      content: (
        <AgentConfigScreen
          section="Escalation Rules"
          tabs={["Hours", "Escalation", "Transfer", "Appointments"]}
          activeTab="Escalation"
          fields={[
            { label: "Escalate on Keywords", value: cfg.escalationKeywords },
            { label: "Escalate on Sentiment", value: "Negative sentiment detected", type: "select" },
            { label: "Notification Method", value: "SMS + Email to dispatch@summitcomforthvac.com" },
            { label: "Max Attempts Before Transfer", value: "2", type: "select" },
          ]}
        />
      ),
    },
    {
      title: "Business Rules — Transfer",
      narration:
        "Route dispatch, sales, and emergency lines. When a caller asks for a manager, Morgan transfers to dispatch within 3 seconds.",
      content: (
        <AgentConfigScreen
          section="Call Transfer"
          tabs={["Hours", "Escalation", "Transfer", "Appointments"]}
          activeTab="Transfer"
          fields={[
            { label: "Dispatch", value: cfg.transferNumbers.dispatch },
            { label: "Sales", value: cfg.transferNumbers.sales },
            { label: "Emergency Line", value: cfg.transferNumbers.emergency },
            {
              label: "Transfer Greeting",
              value: "Let me connect you with our dispatch team right away.",
              type: "textarea",
            },
          ]}
        />
      ),
    },
    {
      title: "Business Rules — Appointments",
      narration:
        "90-minute diagnostic slots, 4-hour minimum notice for standard visits, immediate dispatch for emergencies, and SMS reminders with tech en-route alerts.",
      content: (
        <AgentConfigScreen
          section="Appointment Rules"
          tabs={["Hours", "Escalation", "Transfer", "Appointments"]}
          activeTab="Appointments"
          fields={[
            { label: "Default Duration", value: cfg.appointmentRules.defaultDuration },
            { label: "Minimum Notice", value: cfg.appointmentRules.minimumNotice },
            { label: "Service Types", value: cfg.appointmentRules.serviceTypes.join(", ") },
            { label: "Confirmation SMS", value: cfg.appointmentRules.confirmationSms, type: "select" },
          ]}
        />
      ),
    },
    {
      title: "Testing — Simulate",
      narration:
        "Run a no-cool emergency scenario: 92 degrees, newborn at home. Morgan flags same-day dispatch and collects address — score 97%.",
      content: (
        <AgentConfigScreen
          section="Agent Simulator"
          tabs={["Simulate", "Review", "Improve"]}
          activeTab="Simulate"
          fields={[
            {
              label: "Simulated Caller",
              value: summit.simulatorScenarios[0].caller,
              type: "textarea",
            },
            {
              label: "Agent Response",
              value: summit.simulatorScenarios[0].agentResponse,
              type: "textarea",
            },
            { label: "Intent Detected", value: summit.simulatorScenarios[0].intent },
          ]}
        />
      ),
      lowerThird: {
        label: "Simulator — Test Call",
        detail: "Scenario: No-Cool Emergency · Score 97%",
      },
    },
    {
      title: "Testing — Review",
      narration:
        "Review simulation transcripts. Call #2 flagged for quoting exact replacement price — update instructions before going live.",
      content: (
        <AgentConfigScreen
          section="Review Transcripts"
          tabs={["Simulate", "Review", "Improve"]}
          activeTab="Review"
          fields={[
            ...summit.simulatorScenarios.map((sim, i) => ({
              label: `Test Call #${i + 1}`,
              value: `Score: ${sim.score}% — ${sim.score >= 90 ? "Passed" : "Needs review"}`,
            })),
            {
              label: "Flagged Issue",
              value: "Call #2 quoted exact AC replacement price — updated to range + free estimate.",
              type: "textarea" as const,
            },
          ]}
        />
      ),
    },
    {
      title: "Testing — Improve",
      narration:
        "After 3 instruction updates and 2 new FAQs, re-test scores hit 96%. Morgan goes live on +1 (303) 555-0147 — monitor the first 50 calls.",
      content: (
        <AgentConfigScreen
          section="Improve & Deploy"
          tabs={["Simulate", "Review", "Improve"]}
          activeTab="Improve"
          fields={[
            { label: "Changes Applied", value: "3 instruction updates, 2 new FAQs" },
            { label: "Re-test Score", value: "96% — Ready for production" },
            { label: "Deployment Status", value: "Agent live on +1 (303) 555-0147" },
            {
              label: "Next Steps",
              value: "Monitor first 50 calls, review analytics weekly, tune FAQs from real transcripts.",
              type: "textarea",
            },
          ]}
        />
      ),
      lowerThird: {
        label: "Agent Live — +1 (303) 555-0147",
        detail: "Re-test Score: 96%",
      },
    },
  ]);

  return (
    <TrainingVideo
      config={{
        title: "AI Agent Configuration",
        videoId: "AIAgentConfiguration",
        chapters,
        totalFrames: TOTAL_FRAMES,
      }}
    />
  );
};

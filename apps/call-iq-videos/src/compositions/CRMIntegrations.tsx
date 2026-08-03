import { TrainingVideo } from "../training/TrainingVideo";
import { buildChapters } from "../training/buildChapters";
import { demo } from "../data/demo";
import { IntegrationsScreen } from "../training/screens/IntegrationsScreen";

const TOTAL_FRAMES = 10800;
const integrations = demo.crm.integrations;

const NAME_ALIASES: Record<string, string> = {
  Zoho: "Zoho CRM",
};

const byName = (names: string[]) =>
  names.map((name) => {
    const lookup = NAME_ALIASES[name] ?? name;
    const int = integrations.find((i) => i.name === lookup);
    if (!int) {
      return { name, category: "Integration", connected: false };
    }
    return {
      name: int.name,
      category: int.category,
      connected: int.connected,
    };
  });

export const CRMIntegrations: React.FC = () => {
  const chapters = buildChapters(TOTAL_FRAMES, [
    {
      title: "HubSpot",
      narration:
        "Connect HubSpot — 412 contacts synced this month. Maria Gonzalez created automatically; David Chen's call logged with transcript.",
      content: <IntegrationsScreen integrations={byName(["HubSpot", "Salesforce", "Zoho"])} />,
      lowerThird: {
        label: "CRM — HubSpot Connected",
        detail: "Auto-sync Contacts & Calls",
      },
    },
    {
      title: "Salesforce",
      narration:
        "Salesforce maps Call IQ leads to Contacts and Opportunities with custom fields for transcript, lead score, and service type.",
      content: <IntegrationsScreen integrations={byName(["Salesforce", "HubSpot", "Zoho"])} />,
    },
    {
      title: "Zoho",
      narration:
        "Zoho CRM syncs SMB leads like James Okonkwo's maintenance plan inquiry — ideal for teams already on Zoho One.",
      content: <IntegrationsScreen integrations={byName(["Zoho", "HubSpot", "Salesforce"])} />,
    },
    {
      title: "Google Calendar",
      narration:
        "Google Calendar sync creates events in real time — David's 3:30 PM diagnostic and Maria's 2:30 PM plumbing visit booked during calls.",
      content: (
        <IntegrationsScreen
          integrations={byName(["Google Calendar", "Outlook", "Webhooks"])}
        />
      ),
    },
    {
      title: "Outlook",
      narration:
        "Microsoft Outlook integration checks dispatch calendar availability for commercial jobs and team scheduling.",
      content: (
        <IntegrationsScreen
          integrations={byName(["Outlook", "Google Calendar", "Webhooks"])}
        />
      ),
    },
    {
      title: "Webhooks",
      narration:
        "Two active webhook endpoints — ServiceTitan job creation and Slack #dispatch-alerts — delivered 1,847 events this month with 3 failures.",
      content: (
        <IntegrationsScreen
          integrations={[
            ...byName(["Webhooks", "HubSpot", "Google Calendar"]),
            ...byName(["Salesforce", "Zoho", "Outlook"]),
          ]}
        />
      ),
      lowerThird: {
        label: "Webhooks",
        detail: "2 Active Endpoints · 1,847 deliveries",
      },
    },
  ]);

  return (
    <TrainingVideo
      config={{
        title: "CRM & Integrations",
        videoId: "CRMIntegrations",
        chapters,
        totalFrames: TOTAL_FRAMES,
      }}
    />
  );
};

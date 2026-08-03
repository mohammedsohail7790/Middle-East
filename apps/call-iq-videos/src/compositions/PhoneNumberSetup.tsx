import { TrainingVideo } from "../training/TrainingVideo";
import { buildChapters } from "../training/buildChapters";
import { agents, phoneNumbers, routingRules } from "../data/demo";
import { PhoneSetupScreen } from "../training/screens/PhoneSetupScreen";

const TOTAL_FRAMES = 7200;

export const PhoneNumberSetup: React.FC = () => {
  const available = phoneNumbers.filter((n) => n.status === "active" || n.status === "available");

  const chapters = buildChapters(TOTAL_FRAMES, [
    {
      title: "Buy a Number",
      narration:
        "Search Denver area code 720 or Boulder 303. Purchase a local number in minutes — no carrier contracts or porting delays.",
      content: (
        <PhoneSetupScreen
          step="Buy a Phone Number"
          numbers={available.slice(0, 3).map((n) => ({
            number: n.number,
            area: `${n.region} — ${n.type === "toll-free" ? "Toll-Free" : "Local"}`,
            status: n.status === "available" ? "Available" : "Available",
          }))}
        />
      ),
      lowerThird: {
        label: "Available Numbers",
        detail: "Denver (720) · Boulder (303) · Toll-Free (800)",
      },
    },
    {
      title: "Assign to Agent",
      narration:
        `Assign ${phoneNumbers[0].number} to ${agents.northline.name} and ${phoneNumbers[1].number} to ${agents.sales.name}. Each number loads its agent's knowledge base and personality.`,
      content: (
        <PhoneSetupScreen
          step="Assign to AI Agent"
          numbers={[
            {
              number: phoneNumbers[0].number,
              area: agents.northline.name,
              status: "Assigned",
            },
            {
              number: phoneNumbers[1].number,
              area: agents.sales.name,
              status: "Assigned",
            },
          ]}
        />
      ),
      lowerThird: {
        label: phoneNumbers[0].number,
        detail: `Assigned to ${agents.northline.name}`,
      },
    },
    {
      title: "Routing Rules",
      narration:
        "Configure business-hours routing to AI, after-hours emergency dispatch, manager transfers, and voicemail fallback with SMS alerts.",
      content: (
        <PhoneSetupScreen
          step="Call Routing"
          routingRules={routingRules.map((r) => ({
            condition: r.condition,
            action: r.action,
          }))}
        />
      ),
    },
    {
      title: "Test Calls",
      narration:
        "Place three test calls: AI answered in 1.2 seconds, sales transfer connected, after-hours SMS alert delivered. All passed — go live.",
      content: (
        <PhoneSetupScreen
          step="Test Your Setup"
          numbers={[
            { number: "Test Call #1", area: "Inbound → AI answered in 1.2s", status: "Passed" },
            { number: "Test Call #2", area: "Transfer to sales — connected", status: "Passed" },
            { number: "Test Call #3", area: "After-hours message + SMS alert", status: "Passed" },
          ]}
        />
      ),
      lowerThird: {
        label: "Test Results",
        detail: "3 of 3 Passed",
      },
    },
  ]);

  return (
    <TrainingVideo
      config={{
        title: "Phone Number Setup",
        videoId: "PhoneNumberSetup",
        chapters,
        totalFrames: TOTAL_FRAMES,
      }}
    />
  );
};

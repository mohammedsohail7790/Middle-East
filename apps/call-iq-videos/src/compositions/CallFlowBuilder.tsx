import { TrainingVideo } from "../training/TrainingVideo";
import { buildChapters } from "../training/buildChapters";
import { WorkflowScreen } from "../training/screens/WorkflowScreen";

const TOTAL_FRAMES = 21600;

const FULL_FLOW = [
  {
    id: "qualify",
    label: "Lead Qualification",
    description: "Score intent · tag service line · capture contact",
    x: 40,
    y: 180,
  },
  {
    id: "appointment",
    label: "Appointment Booking",
    description: "Check calendar · book slot · assign tech",
    x: 340,
    y: 80,
  },
  {
    id: "crm",
    label: "CRM Update",
    description: "HubSpot contact · call note · lead score",
    x: 640,
    y: 180,
  },
  {
    id: "sms",
    label: "SMS Confirmation",
    description: "Booking details · address · reschedule link",
    x: 940,
    y: 80,
  },
  {
    id: "calendar",
    label: "Calendar Event",
    description: "Google Calendar event · tech dispatch alert",
    x: 1240,
    y: 180,
  },
];

export const CallFlowBuilder: React.FC = () => {
  const chapters = buildChapters(TOTAL_FRAMES, [
    {
      title: "Lead Qualification",
      narration:
        "Maria calls about a kitchen leak. Sarah qualifies urgency, captures her address on Tennyson Street, and tags the lead as emergency plumbing.",
      content: <WorkflowScreen nodes={[FULL_FLOW[0]]} activeIndex={0} />,
      lowerThird: {
        label: "Workflow Trigger",
        detail: "Inbound Call — +1 (720) 555-0188",
      },
    },
    {
      title: "Appointment Booking",
      narration:
        "Sarah checks Carlos's availability and books Maria for 2:30 PM today — no hold music, no callback queue.",
      content: <WorkflowScreen nodes={FULL_FLOW.slice(0, 2)} activeIndex={1} />,
    },
    {
      title: "CRM Update",
      narration:
        "HubSpot creates Maria Gonzalez as a contact, logs the full transcript, and sets deal stage to Appointment Scheduled.",
      content: <WorkflowScreen nodes={FULL_FLOW.slice(0, 3)} activeIndex={2} />,
    },
    {
      title: "SMS Confirmation",
      narration:
        "Maria receives an SMS: 'Northline Home Services — plumbing visit confirmed today 2:30 PM. Tech: Carlos V. Reply RESCHEDULE to change.'",
      content: <WorkflowScreen nodes={FULL_FLOW.slice(0, 4)} activeIndex={3} />,
    },
    {
      title: "Calendar Event",
      narration:
        "A Google Calendar event appears on dispatch's calendar with address, service type, and linked HubSpot contact.",
      content: <WorkflowScreen nodes={FULL_FLOW} activeIndex={4} />,
    },
    {
      title: "Full Workflow",
      narration:
        "Five automated steps — qualify, book, sync CRM, confirm via SMS, create calendar event — zero manual data entry from call to dispatch.",
      content: <WorkflowScreen nodes={FULL_FLOW} activeIndex={4} />,
      lowerThird: {
        label: "End-to-End Automation",
        detail: "0 Manual Steps · /dashboard/automation",
      },
    },
  ]);

  return (
    <TrainingVideo
      config={{
        title: "Call Flow Builder",
        videoId: "CallFlowBuilder",
        chapters,
        totalFrames: TOTAL_FRAMES,
      }}
    />
  );
};

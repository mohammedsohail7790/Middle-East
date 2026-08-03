import { TrainingVideo } from "../training/TrainingVideo";
import { buildChapters } from "../training/buildChapters";
import { analyticsChapters, reportingPeriod } from "../data/demo";
import { AnalyticsScreen } from "../training/screens/AnalyticsScreen";

const TOTAL_FRAMES = 9000;

export const AnalyticsReporting: React.FC = () => {
  const chapters = buildChapters(TOTAL_FRAMES, [
    {
      title: "Total Calls",
      narration:
        "Northline Home Services handled 1,284 inbound calls this month — 96% answered with an average duration of 3 minutes 48 seconds.",
      content: (
        <AnalyticsScreen
          metrics={analyticsChapters.totalCalls}
          chartLabel="Daily Call Volume"
        />
      ),
      lowerThird: {
        label: "Reporting Period",
        detail: reportingPeriod.label,
      },
    },
    {
      title: "Missed Calls",
      narration:
        "Only 51 missed calls — down 32% from last month. 63% were after hours; 78% recovered via callback or SMS follow-up.",
      content: (
        <AnalyticsScreen
          metrics={analyticsChapters.missedCalls}
          chartLabel="Missed Call Trends"
        />
      ),
    },
    {
      title: "Conversion Rate",
      narration:
        "49% conversion rate generated 634 qualified leads and 296 booked appointments — up 22% and 15% respectively.",
      content: (
        <AnalyticsScreen
          metrics={analyticsChapters.conversion}
          chartLabel="Conversion Funnel"
        />
      ),
    },
    {
      title: "Appointments",
      narration:
        "296 appointments booked with an 88.2% show rate. Only 7% rescheduled — most common services: HVAC diagnostic and emergency plumbing.",
      content: (
        <AnalyticsScreen
          metrics={analyticsChapters.appointments}
          chartLabel="Appointments by Day"
        />
      ),
    },
    {
      title: "Agent Performance",
      narration:
        "Sarah scores 96% satisfaction on 892 calls. Alex handles sales qualification at 91%. Escalation rate dropped to 3.8%.",
      content: (
        <AnalyticsScreen
          metrics={analyticsChapters.agentPerformance}
          chartLabel="Agent Comparison"
        />
      ),
    },
    {
      title: "Cost Savings",
      narration:
        "At $149 per month versus $3,200 for a full-time receptionist, Northline saves $3,051 monthly — a 95% cost reduction with higher lead capture.",
      content: (
        <AnalyticsScreen
          metrics={analyticsChapters.costSavings}
          chartLabel="Cost Comparison"
        />
      ),
      lowerThird: {
        label: "Your ROI",
        detail: "$3,051/mo saved · 95% cost reduction",
      },
    },
  ]);

  return (
    <TrainingVideo
      config={{
        title: "Analytics & Reporting",
        videoId: "AnalyticsReporting",
        chapters,
        totalFrames: TOTAL_FRAMES,
      }}
    />
  );
};

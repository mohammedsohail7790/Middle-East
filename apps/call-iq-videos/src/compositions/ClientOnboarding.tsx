import { TrainingVideo } from "../training/TrainingVideo";
import { buildChapters } from "../training/buildChapters";
import { agents, northline, phoneNumbers } from "../data/demo";
import { DashboardOverviewScreen } from "../training/screens/DashboardOverviewScreen";
import { OnboardingScreen } from "../training/screens/OnboardingScreen";

const TOTAL_FRAMES = 10800;
const mainNumber = phoneNumbers[0].number;
const ob = northline.onboarding;

export const ClientOnboarding: React.FC = () => {
  const chapters = buildChapters(TOTAL_FRAMES, [
    {
      title: "Sign Up",
      narration:
        "Start your free trial at calliqlabs.com — fourteen days, no credit card. Enter your name, work email, password, and company name.",
      content: (
        <OnboardingScreen
          url="https://www.calliqlabs.com/signup"
          headline="Start your free trial"
          subtitle="14 days. No credit card."
          fields={[
            { label: "Full name", value: "Rachel Torres", filled: true },
            { label: "Work email", value: ob.signupEmail, filled: true },
            { label: "Password", value: "••••••••••", filled: true },
            { label: "Company name", value: northline.legalName, filled: true },
          ]}
          buttonLabel="Create account"
        />
      ),
    },
    {
      title: "Verify Email",
      narration:
        "Call IQ sends a confirmation link to your inbox — not a code. Click the link to verify your account, then continue to setup.",
      content: (
        <OnboardingScreen
          url="https://www.calliqlabs.com/signup"
          headline="Check your email"
          subtitle="Confirm your account to continue."
          notice={`We sent a confirmation link to ${ob.signupEmail}. Open the link in your email to verify your account and finish setup.`}
          buttonLabel="Resend confirmation email"
          showCheckmark
        />
      ),
    },
    {
      title: "Business Details",
      narration:
        "The onboarding wizard starts with your business. Enter Northline Home Services, your services, and set your timezone to Mountain.",
      content: (
        <OnboardingScreen
          stepLabel="Business"
          wizardStep={0}
          headline="Tell us about your business"
          subtitle="We'll personalize your AI receptionist."
          fields={[
            { label: "Company name", value: northline.dba, filled: true },
            {
              label: "Services (comma-separated)",
              value: "Emergency Plumbing, HVAC Repair, Electrical Diagnostics",
              filled: true,
            },
            { label: "Timezone", value: "Mountain (America/Denver)", filled: true },
          ]}
          buttonLabel="Continue"
        />
      ),
    },
    {
      title: "Industries",
      narration:
        "Select every industry you serve — HVAC, plumbing, and electrical — so your AI uses the right vocabulary on every call.",
      content: (
        <OnboardingScreen
          stepLabel="Industry"
          wizardStep={1}
          headline="What industries are you in?"
          subtitle="Select all that apply — gives your AI the right vocabulary."
          chips={[
            { label: "HVAC", icon: "🌡️", selected: true },
            { label: "Plumbing", icon: "🔧", selected: true },
            { label: "Electrical", icon: "⚡", selected: true },
            { label: "Other", icon: "📋" },
          ]}
          buttonLabel="Continue"
        />
      ),
    },
    {
      title: "Business Hours",
      narration:
        "Set working days and hours. Your AI still answers twenty-four seven, but tells callers when your team is available.",
      content: (
        <OnboardingScreen
          stepLabel="Hours"
          wizardStep={2}
          headline="Business hours"
          subtitle="AI answers 24/7 but mentions after-hours."
          fields={[
            { label: "Working days", value: "Mon, Tue, Wed, Thu, Fri, Sat", filled: true },
            { label: "Start", value: "07:00", filled: true },
            { label: "End", value: "19:00", filled: true },
          ]}
          buttonLabel="Continue"
        />
      ),
    },
    {
      title: "AI Receptionist",
      narration:
        "Name your AI receptionist Sarah, choose a professional personality, and preview the voice callers will hear.",
      content: (
        <OnboardingScreen
          stepLabel="AI agent"
          wizardStep={3}
          headline="Name your AI receptionist"
          subtitle="Callers will hear this name. Update anytime on the AI Agent page."
          fields={[
            { label: "Agent name", value: agents.northline.displayName, filled: true },
            { label: "Personality", value: "Professional — Polished and efficient", filled: true },
            { label: "Voice preview", value: agents.northline.voiceLabel, filled: true },
          ]}
          buttonLabel="Continue"
        />
      ),
    },
    {
      title: "Phone Number",
      narration:
        `Search area code 720, claim ${mainNumber}, and your AI line is live — included on your free trial.`,
      content: (
        <OnboardingScreen
          stepLabel="Phone line"
          wizardStep={4}
          headline="Get your AI phone line"
          subtitle="Pick a US area code and claim a line. Calls reach your AI receptionist automatically."
          fields={[
            { label: "Area code", value: "720", filled: true },
            { label: "Selected number", value: mainNumber, filled: true },
            { label: "Region", value: "Denver, CO", filled: true },
          ]}
          buttonLabel="Claim first available in this area code"
        />
      ),
      lowerThird: {
        label: `New Number — ${mainNumber}`,
        detail: `Assigned to ${agents.northline.name}`,
      },
    },
    {
      title: "Setup Complete",
      narration:
        "You're all set. Sarah is ready for Northline Home Services on a fourteen-day trial with sixty included minutes. Run a test call, then open your dashboard.",
      content: (
        <OnboardingScreen
          url="https://www.calliqlabs.com/onboarding"
          headline="You're all set!"
          completion={{
            agentName: agents.northline.displayName,
            company: northline.dba,
            phone: mainNumber,
            trialLine: "14-day free trial with 60 minutes.",
          }}
        />
      ),
    },
    {
      title: "Dashboard Overview",
      narration:
        "Your dashboard shows forty-seven calls today, twenty-three leads, eight appointments, and a forty-nine percent conversion rate.",
      content: <DashboardOverviewScreen />,
    },
  ]);

  return (
    <TrainingVideo
      config={{
        title: "Client Onboarding",
        videoId: "ClientOnboarding",
        chapters,
        totalFrames: TOTAL_FRAMES,
      }}
    />
  );
};

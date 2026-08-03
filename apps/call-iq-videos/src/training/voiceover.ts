export const TRAINING_VIDEO_SLUGS = {
  WelcomeToCallIQ: "welcome-to-call-iq",
  ClientOnboarding: "client-onboarding",
  AIAgentConfiguration: "ai-agent-configuration",
  PhoneNumberSetup: "phone-number-setup",
  CallFlowBuilder: "call-flow-builder",
  AnalyticsReporting: "analytics-reporting",
  CRMIntegrations: "crm-integrations",
} as const;

export type TrainingVideoId = keyof typeof TRAINING_VIDEO_SLUGS;

/** Path relative to public/ for chapter voiceover MP3. */
export const getChapterVoiceover = (
  videoId: TrainingVideoId,
  chapterNumber: number,
): string => {
  const slug = TRAINING_VIDEO_SLUGS[videoId];
  const file = `${String(chapterNumber).padStart(2, "0")}.mp3`;
  return `voiceover/training/${slug}/${file}`;
};

/**
 * Synthetic Caller Framework - Type Definitions
 * 
 * Core types for simulating realistic caller behavior patterns
 * for automated end-to-end testing of the Call IQ platform.
 */

export type PersonalityType =
  | 'angry'
  | 'confused'
  | 'interrupter'
  | 'fast_talker'
  | 'elderly'
  | 'noisy_environment'
  | 'booking_focused'
  | 'price_shopper'
  | 'emergency';

export type BackgroundNoiseType =
  | 'traffic'
  | 'construction'
  | 'crowd'
  | 'wind'
  | 'office'
  | 'restaurant'
  | 'none';

export interface PersonalityTraits {
  /** Rate of interruptions (0-1, where 1 = interrupts every response) */
  interruptionRate: number;

  /** Speech pace multiplier (1.0 = normal, 1.5 = 50% faster, 0.6 = 40% slower) */
  speechPace: number;

  /** Silence gap range in milliseconds [min, max] */
  silenceGaps: [number, number];

  /** Emotional intensity (0-1, where 1 = maximum emotion) */
  emotionalIntensity?: number;

  /** Whether caller repeats questions when not understood */
  repeatQuestions?: boolean;

  /** Likelihood of requesting call transfer (0-1) */
  transferLikelihood?: number;

  /** Rate of providing invalid/incorrect answers (0-1) */
  invalidAnswers?: number;

  /** Rate of requesting clarification (0-1) */
  clarificationRequests?: number;

  /** Timing of interruptions ('early' | 'mid' | 'late') */
  interruptionTiming?: 'early' | 'mid' | 'late';

  /** Whether caller completes full sentences */
  completeSentences?: boolean;

  /** Words per minute (normal = 150) */
  wordsPerMinute?: number;

  /** Whether caller uses run-on sentences */
  runOnSentences?: boolean;

  /** Whether caller repeats information */
  repeatInformation?: boolean;

  /** Rate of mishearing/misunderstanding (0-1) */
  hearingDifficulty?: number;

  /** Rate of technology confusion (0-1) */
  technologyConfusion?: number;

  /** Background noise configuration */
  backgroundNoise?: {
    type: BackgroundNoiseType[];
    volume: number; // 0-1, relative to speech volume
    intermittent: boolean;
  };

  /** Whether caller repeats themselves */
  repeatSelf?: number;

  /** Whether caller is goal-oriented */
  goalOriented?: boolean;

  /** Whether caller provides complete information */
  providesCompleteInfo?: boolean;

  /** Whether caller follows instructions */
  followsInstructions?: boolean;

  /** Likelihood of successful booking (0-1) */
  bookingSuccess?: number;

  /** Rate of price-related questions (0-1) */
  priceQuestions?: number;

  /** Whether caller is comparison shopping */
  comparisonShopping?: boolean;

  /** Likelihood of booking after inquiry (0-1) */
  bookingLikelihood?: number;

  /** Urgency level */
  urgencyLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export interface CallerPersonality {
  type: PersonalityType;
  name: string;
  description: string;
  traits: PersonalityTraits;
  phrases: string[];
  scenario: string;
}

export interface TestScenario {
  name: string;
  description: string;
  duration: string;
  personality: PersonalityType;
  steps: TestStep[];
  successCriteria: SuccessCriteria;
}

export interface TestStep {
  action: TestAction;
  input?: string;
  expect?: string;
  timing?: string;
  count?: number;
  duration?: string;
  backgroundNoise?: BackgroundNoiseType;
  volume?: number;
}

export type TestAction =
  | 'greet'
  | 'state_need'
  | 'provide_service'
  | 'provide_date'
  | 'confirm_time'
  | 'provide_name'
  | 'provide_phone'
  | 'provide_email'
  | 'confirm_booking'
  | 'request_transfer'
  | 'confirm_transfer'
  | 'ask_question'
  | 'expect_answer'
  | 'follow_up'
  | 'interrupt'
  | 'rapid_questions'
  | 'complete_booking'
  | 'ask_multiple_questions'
  | 'provide_detailed_info'
  | 'ask_follow_ups'
  | 'connect'
  | 'disconnect'
  | 'reconnect'
  | 'repeat'
  | 'silence'
  | 'expect_timeout';

export interface SuccessCriteria {
  bookingCreated?: boolean;
  leadCaptured?: boolean;
  duration?: string;
  interruptions?: string;
  transferToolCalled?: boolean;
  transferReason?: string;
  knowledgeToolCalled?: boolean;
  answersProvided?: number;
  handledInterruptions?: string;
  noOverlap?: boolean;
  bookingCompleted?: boolean;
  sessionStable?: boolean;
  noMemoryLeaks?: boolean;
  noZombieSessions?: boolean;
  reconnectsHandled?: number;
  sessionRecovery?: boolean;
  timeoutTriggered?: boolean;
  cleanupCompleted?: boolean;
  audioQuality?: string;
  noDropouts?: boolean;
}

export interface TestResult {
  scenarioName: string;
  personality: PersonalityType;
  startTime: Date;
  endTime: Date;
  duration: number;
  success: boolean;
  criteriaResults: Record<string, boolean>;
  metrics: TestMetrics;
  errors: string[];
  warnings: string[];
}

export interface TestMetrics {
  sessionId?: string;
  callSid?: string;
  turnCount: number;
  interruptionCount: number;
  toolCallCount: number;
  averageTurnLatency: number;
  p95TurnLatency: number;
  p99TurnLatency: number;
  reconnectCount: number;
  audioDropouts: number;
  memoryUsage: {
    start: number;
    end: number;
    peak: number;
  };
  cpuUsage: {
    average: number;
    peak: number;
  };
}

export interface SyntheticCallerConfig {
  tenantId: string;
  gatewayUrl: string;
  personality: CallerPersonality;
  scenario: TestScenario;
  audioConfig?: {
    sampleRate: number;
    encoding: string;
    channels: number;
  };
  debug?: boolean;
}

export interface AudioFrame {
  payload: string; // base64 encoded audio
  timestamp: number;
  sequenceNumber: number;
}

export interface CallSession {
  sessionId: string;
  callSid: string;
  streamSid: string;
  startTime: Date;
  endTime?: Date;
  personality: PersonalityType;
  scenario: string;
  status: 'connecting' | 'active' | 'completed' | 'failed' | 'timeout';
  metrics: Partial<TestMetrics>;
}

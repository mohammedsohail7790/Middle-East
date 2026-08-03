/**
 * Synthetic Caller Personality: Elderly Caller
 * 
 * A caller who speaks slowly, takes long pauses, and may have hearing difficulties.
 * Tests patience, clarity, and handling of slower-paced conversations.
 */

import { CallerPersonality } from '../framework/types.js';

export const elderlyCallerPersonality: CallerPersonality = {
  type: 'elderly',
  name: 'Elderly Caller',
  description: 'Caller who speaks slowly with long pauses and occasional hearing difficulty',
  
  traits: {
    interruptionRate: 0.1,           // Rarely interrupts
    speechPace: 0.6,                 // 40% slower
    silenceGaps: [3000, 7000],       // Very long pauses (thinking)
    emotionalIntensity: 0.3,         // Calm, patient
    repeatInformation: true,         // Often repeats for confirmation
    hearingDifficulty: 0.3,          // 30% chance to mishear
    technologyConfusion: 0.5,        // May be confused by process
    wordsPerMinute: 100,             // Slow speech
  },
  
  phrases: [
    // Polite
    "Hello, dear",
    "Thank you so much",
    "I appreciate your help",
    "You're very kind",
    "Bless you",
    
    // Hearing difficulty
    "I'm sorry, can you repeat that?",
    "I didn't quite catch that...",
    "Could you speak up a little?",
    "What was that again?",
    "Pardon me?",
    
    // Taking time
    "Let me write this down...",
    "One moment, please...",
    "Give me just a second...",
    "I need to find my glasses...",
    "Where did I put that...",
    
    // Confirmation
    "So you said...?",
    "Let me make sure I have this right...",
    "Did you say Tuesday?",
    "Was that 2 o'clock?",
    
    // Technology confusion
    "I'm not very good with these things...",
    "How does this work?",
    "Do I need to do something?",
    "Is this the right number?",
  ],
  
  scenario: 'patient_booking',
};

export function generateElderlyConversation(): string[] {
  return [
    "Hello, dear. I need to schedule an appointment...",
    "My heater isn't working properly... it's making strange noises...",
    "Let me check my calendar... one moment please...",
    "Tuesday would be good... what time did you say?",
    "2 PM? Let me write that down... T-u-e-s-d-a-y at 2...",
    "My name is Margaret Johnson... J-O-H-N-S-O-N...",
    "My phone number... let me find it... it's 555-0123...",
    "Thank you so much for your help, dear. I appreciate it.",
  ];
}

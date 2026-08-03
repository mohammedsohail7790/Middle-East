/**
 * Synthetic Caller Personality: Noisy Environment Caller
 * 
 * A caller in a loud environment (traffic, construction, crowd).
 * Tests audio quality handling and noise resilience.
 */

import { CallerPersonality } from '../framework/types.js';

export const noisyEnvironmentPersonality: CallerPersonality = {
  type: 'noisy_environment',
  name: 'Noisy Environment Caller',
  description: 'Caller in loud environment with background noise',
  
  traits: {
    interruptionRate: 0.2,           // Occasional interruptions
    speechPace: 1.1,                 // Slightly faster (rushing)
    silenceGaps: [300, 800],         // Normal gaps
    emotionalIntensity: 0.5,         // Moderate
    repeatSelf: 0.5,                 // Often repeats due to noise
    backgroundNoise: {
      type: ['traffic', 'construction', 'crowd', 'wind'],
      volume: 0.4,                   // 40% of speech volume
      intermittent: true,
    },
    wordsPerMinute: 160,             // Slightly fast
  },
  
  phrases: [
    // Noise acknowledgment
    "Sorry, it's loud here—",
    "Can you hear me?",
    "Let me move somewhere quieter—",
    "Hold on, there's a lot of noise—",
    "I'm outside right now—",
    
    // Repetition
    "I said—",
    "Like I mentioned—",
    "Again, it's—",
    "To repeat—",
    
    // Apologies
    "Sorry about the noise",
    "Excuse the background",
    "It's really loud here",
    "Bear with me",
    
    // Quick responses
    "Yes, that's right",
    "Correct",
    "That works",
    "Got it",
  ],
  
  scenario: 'mobile_booking',
};

export function generateNoisyEnvironmentConversation(): string[] {
  return [
    "Hi, I need to book— sorry, it's loud here— I need to book an appointment",
    "Can you hear me? I said HVAC repair",
    "Tomorrow afternoon— hold on, let me move— tomorrow afternoon works",
    "Yes, 2 PM is good— sorry about the noise",
    "John Smith— S-M-I-T-H",
    "555-0123— can you hear me?",
    "Great, thanks— I'll be inside by then",
  ];
}

/**
 * Synthetic Caller Personality: Interrupt-Heavy Caller
 * 
 * A caller who constantly interrupts, often mid-sentence.
 * Tests barge-in handling, interruption recovery, and conversation flow.
 */

import { CallerPersonality } from '../framework/types.js';

export const interruptHeavyPersonality: CallerPersonality = {
  type: 'interrupter',
  name: 'Interrupt-Heavy Caller',
  description: 'Caller who interrupts 90% of responses, often mid-sentence',
  
  traits: {
    interruptionRate: 0.9,           // Interrupts 90% of responses
    speechPace: 1.2,                 // 20% faster
    silenceGaps: [50, 200],          // Very short gaps
    emotionalIntensity: 0.6,         // Moderate intensity
    interruptionTiming: 'early',     // Interrupts within 2 seconds
    completeSentences: false,        // Rarely finishes sentences
    wordsPerMinute: 170,             // Fast speech
  },
  
  phrases: [
    // Quick interruptions
    "Yeah yeah, but—",
    "Hold on—",
    "Wait—",
    "Let me just—",
    "Okay but—",
    "Right, so—",
    
    // Mid-thought
    "Actually—",
    "No wait—",
    "Hang on—",
    "One sec—",
    
    // Rapid fire
    "Yeah",
    "Okay",
    "Right",
    "Got it",
    "Sure",
    
    // Cutting off
    "I know, I know, but—",
    "Yeah I get it, but—",
    "Okay fine, but—",
    "Sure sure, but—",
  ],
  
  scenario: 'rapid_fire_questions',
};

export function generateInterruptHeavyConversation(): string[] {
  return [
    "Hi I need—",
    "Yeah yeah I know but—",
    "Right but when can—",
    "Okay but how much—",
    "Sure but do you—",
    "Got it but what about—",
    "Fine but can I—",
    "Okay so tomorrow at—",
  ];
}

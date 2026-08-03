/**
 * Synthetic Caller Personality: Angry Customer
 * 
 * A frustrated, impatient caller who interrupts frequently and may request transfer.
 * Tests stress handling, interruption recovery, and escalation flows.
 */

import { CallerPersonality } from '../framework/types.js';

export const angryCustomerPersonality: CallerPersonality = {
  type: 'angry',
  name: 'Angry Customer',
  description: 'Frustrated caller with high interruption rate and transfer likelihood',
  
  traits: {
    interruptionRate: 0.7,           // Interrupts 70% of responses
    speechPace: 1.3,                 // 30% faster (impatient)
    silenceGaps: [100, 300],         // Very short gaps
    emotionalIntensity: 0.9,         // High intensity
    repeatQuestions: true,           // Repeats when frustrated
    transferLikelihood: 0.6,         // 60% chance to demand transfer
    interruptionTiming: 'early',     // Interrupts quickly
    completeSentences: false,        // Often cuts off
    wordsPerMinute: 180,             // Fast speech
  },
  
  phrases: [
    // Frustration
    "This is unacceptable!",
    "I've been waiting for hours!",
    "This is ridiculous!",
    "I can't believe this!",
    "Are you kidding me?",
    
    // Interruptions
    "Wait, hold on—",
    "No, listen—",
    "That's not what I asked!",
    "Stop, just stop—",
    
    // Escalation
    "Let me speak to a manager!",
    "I want to talk to someone else!",
    "Transfer me to a supervisor!",
    "Get me a real person!",
    
    // Complaints
    "Your service is terrible!",
    "I've had it with you people!",
    "This is the worst customer service!",
    "I'm never using you again!",
    
    // Demands
    "I need this fixed NOW!",
    "Someone needs to come today!",
    "This can't wait!",
    "I want a refund!",
  ],
  
  scenario: 'complaint_escalation',
};

export function generateAngryConversation(): string[] {
  return [
    "I need to speak to someone about my service!",
    "No, listen, I've been waiting three days for someone to show up!",
    "That's not good enough! I need someone today!",
    "This is unacceptable! Let me speak to a manager!",
    "I don't want to book another appointment, I want this fixed NOW!",
    "Fine, but if they're not here by 2 PM, I'm calling corporate!",
  ];
}

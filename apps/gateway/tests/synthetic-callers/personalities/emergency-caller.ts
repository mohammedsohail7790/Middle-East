/**
 * Synthetic Caller Personality: Emergency Caller
 * 
 * A caller with an urgent situation requiring immediate help.
 * Tests urgency handling, transfer logic, and priority routing.
 */

import { CallerPersonality } from '../framework/types.js';

export const emergencyCallerPersonality: CallerPersonality = {
  type: 'emergency',
  name: 'Emergency Caller',
  description: 'Caller with urgent situation requiring immediate help',
  
  traits: {
    interruptionRate: 0.6,           // High interruption rate
    speechPace: 1.4,                 // 40% faster (stressed)
    silenceGaps: [100, 500],         // Short gaps
    emotionalIntensity: 0.95,        // Very high intensity
    urgencyLevel: 'critical',        // Critical urgency
    transferLikelihood: 0.8,         // 80% need immediate help
    wordsPerMinute: 190,             // Fast, stressed speech
  },
  
  phrases: [
    // Urgency
    "This is an emergency!",
    "I need someone right now!",
    "This can't wait!",
    "It's urgent!",
    "This is critical!",
    
    // Stress
    "Please hurry!",
    "How fast can you get here?",
    "When can someone come?",
    "I need help immediately!",
    "This is serious!",
    
    // Specific emergencies
    "There's water everywhere!",
    "The pipe burst!",
    "There's no heat and it's freezing!",
    "The AC is out and it's 100 degrees!",
    "There's a gas smell!",
    "The power is out!",
    
    // Transfer requests
    "Can I speak to someone now?",
    "I need to talk to a technician!",
    "Get me a manager!",
    "Who can help me right now?",
    
    // Time pressure
    "I can't wait until tomorrow!",
    "This needs to be fixed today!",
    "Can someone come in the next hour?",
    "How soon can you be here?",
  ],
  
  scenario: 'emergency_dispatch',
};

export function generateEmergencyConversation(): string[] {
  return [
    "This is an emergency! My pipe burst and there's water everywhere!",
    "I need someone here right now! How fast can you get here?",
    "This can't wait! The water is flooding my basement!",
    "Can someone come in the next hour? This is critical!",
    "Okay, but please hurry! The damage is getting worse!",
    "My name is John Smith, 555-0123, 123 Main Street",
    "Thank you! Please send someone as soon as possible!",
  ];
}

/**
 * Synthetic Caller Personality: Fast Talker
 * 
 * A caller who speaks very quickly with minimal pauses.
 * Tests speech recognition at high speed and information processing.
 */

import { CallerPersonality } from '../framework/types.js';

export const fastTalkerPersonality: CallerPersonality = {
  type: 'fast_talker',
  name: 'Fast Talker',
  description: 'Caller who speaks 50% faster than normal with minimal pauses',
  
  traits: {
    interruptionRate: 0.5,           // Moderate interruptions
    speechPace: 1.5,                 // 50% faster
    silenceGaps: [50, 150],          // Very short gaps
    emotionalIntensity: 0.5,         // Neutral
    wordsPerMinute: 200,             // vs normal 150
    runOnSentences: true,            // Long sentences without breaks
  },
  
  phrases: [
    // Run-on sentences
    "Yeah so I need to book an appointment for tomorrow morning around 9 or 10 maybe 11 if that works better for you guys",
    "My air conditioner stopped working yesterday afternoon and it's really hot in here so I need someone to come out as soon as possible",
    "I'm available pretty much anytime this week except for Wednesday morning because I have a meeting but other than that I'm flexible",
    
    // Quick responses
    "Yep that works",
    "Sure sounds good",
    "Perfect let's do it",
    "Great that's fine",
    
    // Information dump
    "My name is John Smith phone number is 555-0123 email is john at email dot com and the address is 123 Main Street",
    "I need HVAC repair the unit is making a weird noise and not cooling properly it's about 5 years old I think",
  ],
  
  scenario: 'rapid_booking',
};

export function generateFastTalkerConversation(): string[] {
  return [
    "Hi yeah I need to schedule an HVAC repair my air conditioner stopped working yesterday",
    "Tomorrow afternoon would be great if you have availability maybe around 2 or 3 PM",
    "Yep 2 PM works perfect",
    "John Smith 555-0123 john dot smith at email dot com",
    "123 Main Street Apartment 4B",
    "Great thanks so much see you tomorrow",
  ];
}

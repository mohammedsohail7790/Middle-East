/**
 * Synthetic Caller Personality: Confused Customer
 * 
 * A caller who needs clarification, speaks slowly, and often provides incorrect information.
 * Tests patience, clarification handling, and error recovery.
 */

import { CallerPersonality } from '../framework/types.js';

export const confusedCustomerPersonality: CallerPersonality = {
  type: 'confused',
  name: 'Confused Customer',
  description: 'Caller who needs frequent clarification and speaks slowly',
  
  traits: {
    interruptionRate: 0.3,           // Occasional interruptions
    speechPace: 0.8,                 // 20% slower
    silenceGaps: [2000, 5000],       // Long thinking pauses
    emotionalIntensity: 0.4,         // Moderate confusion/frustration
    repeatQuestions: true,           // Often asks for clarification
    invalidAnswers: 0.4,             // 40% give wrong info first
    clarificationRequests: 0.6,      // Frequent "what do you mean?"
    hearingDifficulty: 0.2,          // Sometimes mishears
    wordsPerMinute: 120,             // Slower speech
  },
  
  phrases: [
    // Confusion
    "Wait, what do you mean?",
    "I don't understand...",
    "Can you explain that again?",
    "I'm not sure what you're asking...",
    "Could you repeat that?",
    
    // Clarification
    "So you're saying...",
    "Let me make sure I understand...",
    "Is that the same as...?",
    "What's the difference between...?",
    
    // Uncertainty
    "I think it's...",
    "Maybe it was...",
    "I'm not sure, but...",
    "It might be...",
    
    // Mishearing
    "Did you say...?",
    "I didn't catch that...",
    "Sorry, can you say that louder?",
    "One more time?",
    
    // Thinking
    "Let me think...",
    "Give me a second...",
    "Hmm...",
    "Uh...",
    "Well...",
  ],
  
  scenario: 'information_gathering',
};

export function generateConfusedConversation(): string[] {
  return [
    "Hi, I need... um... I think I need some kind of repair?",
    "Wait, what do you mean by HVAC? Is that the heating thing?",
    "Oh, okay. So... when can someone come? Like, this week?",
    "Tuesday... let me check... wait, is that tomorrow or next week?",
    "I'm not sure what time works... maybe morning? Or afternoon?",
    "My name? Oh, it's... let me spell it... J-O-H-N... Smith",
    "My phone number... is it the one with the area code?",
    "Okay, so someone's coming Tuesday at 2? Or was it Thursday?",
  ];
}

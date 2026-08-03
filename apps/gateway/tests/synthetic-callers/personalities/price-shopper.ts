/**
 * Synthetic Caller Personality: Price Shopper
 * 
 * A caller focused on pricing and comparisons, may not book.
 * Tests knowledge base queries and sales handling.
 */

import { CallerPersonality } from '../framework/types.js';

export const priceShopperPersonality: CallerPersonality = {
  type: 'price_shopper',
  name: 'Price Shopper',
  description: 'Caller focused on pricing with low booking likelihood',
  
  traits: {
    interruptionRate: 0.3,           // Moderate interruptions
    speechPace: 1.0,                 // Normal pace
    silenceGaps: [500, 1500],        // Normal gaps
    emotionalIntensity: 0.4,         // Neutral
    priceQuestions: 0.8,             // Asks about price 80% of time
    comparisonShopping: true,        // Comparing options
    bookingLikelihood: 0.3,          // Only 30% book
    transferLikelihood: 0.2,         // May ask for sales
    wordsPerMinute: 150,             // Normal speech
  },
  
  phrases: [
    // Price questions
    "How much does that cost?",
    "What's the price for that?",
    "Do you have any discounts?",
    "What's included in that price?",
    "Is there a cheaper option?",
    
    // Comparison
    "Can you price match?",
    "I saw another company charging less",
    "What makes you different?",
    "Why is it more expensive than...?",
    
    // Hesitation
    "I need to think about it",
    "Let me check with my spouse",
    "I'm getting other quotes",
    "I'll call you back",
    
    // Negotiation
    "Can you do better than that?",
    "Is that your best price?",
    "What if I book today?",
    "Any promotions running?",
    
    // Information gathering
    "What services are included?",
    "How long does it take?",
    "Do you charge for estimates?",
    "What's your warranty?",
  ],
  
  scenario: 'price_inquiry',
};

export function generatePriceShopperConversation(): string[] {
  return [
    "Hi, I'm calling to get some pricing information",
    "How much do you charge for HVAC repair?",
    "What's included in that price?",
    "Do you have any discounts or promotions?",
    "I saw another company charging $50 less, can you match that?",
    "What makes your service worth the extra cost?",
    "Let me think about it and I'll call you back",
  ];
}

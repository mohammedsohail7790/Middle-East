/**
 * Synthetic Caller Personality: Booking-Focused
 * 
 * A cooperative caller who wants to schedule an appointment.
 * Provides complete information, follows instructions, and completes booking successfully.
 * 
 * Use Case: Baseline testing for successful booking flow
 */

import { CallerPersonality } from '../framework/types.js';

export const bookingFocusedPersonality: CallerPersonality = {
  type: 'booking_focused',
  name: 'Booking-Focused Caller',
  description: 'Cooperative caller who wants to schedule an appointment efficiently',
  
  traits: {
    interruptionRate: 0.2,           // Rarely interrupts
    speechPace: 1.0,                 // Normal pace
    silenceGaps: [500, 1500],        // Normal thinking pauses
    emotionalIntensity: 0.3,         // Calm and neutral
    repeatQuestions: false,          // Understands first time
    transferLikelihood: 0.05,        // Rarely needs transfer
    goalOriented: true,              // Focused on booking
    providesCompleteInfo: true,      // Gives all needed details
    followsInstructions: true,       // Follows AI guidance
    bookingSuccess: 0.9,             // 90% complete booking
    wordsPerMinute: 150,             // Normal speech rate
  },
  
  phrases: [
    // Opening
    "Hi, I need to schedule an appointment",
    "Hello, I'd like to book a service call",
    "I need to set up an appointment",
    
    // Service description
    "I need HVAC repair",
    "My air conditioner isn't working",
    "The heater is making strange noises",
    "I need a maintenance check",
    
    // Date/time preferences
    "Tomorrow afternoon would work",
    "I'm available Tuesday morning",
    "Anytime after 2 PM is fine",
    "I'm flexible with the time",
    
    // Confirmations
    "Yes, that works for me",
    "That time is perfect",
    "Sounds good",
    "I can do that",
    
    // Information providing
    "My name is John Smith",
    "It's 555-0123",
    "My email is john@example.com",
    "The address is 123 Main Street",
    
    // Closing
    "Thank you",
    "Great, I appreciate it",
    "Perfect, see you then",
    "Thanks for your help",
  ],
  
  scenario: 'successful_booking',
};

/**
 * Generate realistic booking conversation flow
 */
export function generateBookingConversation(): string[] {
  return [
    "Hi, I need to schedule an appointment for HVAC repair",
    "My air conditioner stopped working yesterday",
    "Tomorrow afternoon would be great if you have availability",
    "Yes, 2 PM works perfectly",
    "My name is John Smith",
    "It's 555-0123",
    "john.smith@email.com",
    "The address is 123 Main Street, Apartment 4B",
    "Yes, that's correct",
    "Perfect, thank you so much",
  ];
}

/**
 * Generate customer information for booking
 */
export interface BookingCustomerInfo {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  service: string;
  preferredDate: string;
  preferredTime: string;
  issue: string;
}

export function generateRandomBookingInfo(): BookingCustomerInfo {
  const firstNames = ['John', 'Sarah', 'Michael', 'Emily', 'David', 'Jessica', 'Robert', 'Lisa'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
  const services = ['HVAC repair', 'plumbing', 'electrical', 'appliance repair', 'maintenance'];
  const issues = [
    'air conditioner not cooling',
    'heater making noise',
    'water leak under sink',
    'circuit breaker tripping',
    'refrigerator not working',
    'routine maintenance check',
  ];
  
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const service = services[Math.floor(Math.random() * services.length)];
  const issue = issues[Math.floor(Math.random() * issues.length)];
  
  // Generate date (tomorrow to 7 days out)
  const daysOut = Math.floor(Math.random() * 7) + 1;
  const date = new Date();
  date.setDate(date.getDate() + daysOut);
  const preferredDate = date.toISOString().split('T')[0];
  
  // Generate time (9 AM to 5 PM)
  const hour = Math.floor(Math.random() * 8) + 9;
  const minute = Math.random() < 0.5 ? '00' : '30';
  const preferredTime = `${hour}:${minute}`;
  
  return {
    name: `${firstName} ${lastName}`,
    phone: `555-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`,
    address: `${Math.floor(Math.random() * 9999) + 1} ${['Main', 'Oak', 'Maple', 'Pine', 'Elm'][Math.floor(Math.random() * 5)]} Street`,
    service,
    preferredDate,
    preferredTime,
    issue,
  };
}

/**
 * Test Scenario: Successful Appointment Booking
 * 
 * Tests the complete booking flow from greeting to confirmation.
 * Uses booking-focused personality for baseline success rate testing.
 */

import { TestScenario } from '../framework/types.js';

export const bookingFlowScenario: TestScenario = {
  name: 'successful_appointment_booking',
  description: 'Complete booking flow with cooperative caller',
  duration: '3-5 minutes',
  personality: 'booking_focused',
  
  steps: [
    {
      action: 'greet',
      expect: 'greeting_response',
    },
    {
      action: 'state_need',
      input: 'I need to schedule an appointment for HVAC repair',
    },
    {
      action: 'provide_service',
      input: 'My air conditioner stopped working',
    },
    {
      action: 'provide_date',
      input: 'Tomorrow afternoon would be great',
    },
    {
      action: 'confirm_time',
      input: 'Yes, 2 PM works perfectly',
    },
    {
      action: 'provide_name',
      input: 'John Smith',
    },
    {
      action: 'provide_phone',
      input: '555-0123',
    },
    {
      action: 'provide_email',
      input: 'john.smith@email.com',
    },
    {
      action: 'confirm_booking',
      expect: 'booking_confirmation',
    },
  ],
  
  successCriteria: {
    bookingCreated: true,
    leadCaptured: true,
    duration: '<5 minutes',
    interruptions: '<3',
  },
};

/**
 * Variant: Quick Booking (minimal conversation)
 */
export const quickBookingScenario: TestScenario = {
  name: 'quick_booking',
  description: 'Minimal conversation booking flow',
  duration: '1-2 minutes',
  personality: 'booking_focused',
  
  steps: [
    {
      action: 'greet',
      expect: 'greeting_response',
    },
    {
      action: 'state_need',
      input: 'I need an HVAC appointment tomorrow at 2 PM',
    },
    {
      action: 'provide_name',
      input: 'John Smith',
    },
    {
      action: 'provide_phone',
      input: '555-0123',
    },
    {
      action: 'confirm_booking',
      expect: 'booking_confirmation',
    },
  ],
  
  successCriteria: {
    bookingCreated: true,
    leadCaptured: true,
    duration: '<2 minutes',
  },
};

/**
 * Variant: Detailed Booking (lots of questions)
 */
export const detailedBookingScenario: TestScenario = {
  name: 'detailed_booking',
  description: 'Booking with many clarifying questions',
  duration: '5-7 minutes',
  personality: 'booking_focused',
  
  steps: [
    {
      action: 'greet',
      expect: 'greeting_response',
    },
    {
      action: 'ask_question',
      input: 'What services do you offer?',
    },
    {
      action: 'expect_answer',
      expect: 'knowledge_retrieved',
    },
    {
      action: 'ask_question',
      input: 'How much does HVAC repair typically cost?',
    },
    {
      action: 'expect_answer',
      expect: 'knowledge_retrieved',
    },
    {
      action: 'ask_question',
      input: 'What are your available times this week?',
    },
    {
      action: 'expect_answer',
      expect: 'knowledge_retrieved',
    },
    {
      action: 'state_need',
      input: 'Okay, I'd like to book an appointment',
    },
    {
      action: 'provide_service',
      input: 'HVAC repair',
    },
    {
      action: 'provide_date',
      input: 'Thursday afternoon',
    },
    {
      action: 'confirm_time',
      input: 'Yes, 3 PM is good',
    },
    {
      action: 'provide_name',
      input: 'John Smith',
    },
    {
      action: 'provide_phone',
      input: '555-0123',
    },
    {
      action: 'confirm_booking',
      expect: 'booking_confirmation',
    },
  ],
  
  successCriteria: {
    bookingCreated: true,
    leadCaptured: true,
    knowledgeToolCalled: true,
    answersProvided: 3,
    duration: '<7 minutes',
  },
};

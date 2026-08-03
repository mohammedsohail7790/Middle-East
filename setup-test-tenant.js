#!/usr/bin/env node
/**
 * Setup Script: Create a test voice tenant and configure it
 * 
 * This script:
 * 1. Creates a test voice tenant via the Call IQ API
 * 2. Outputs the tenant ID for manual configuration
 * 
 * Usage: node setup-test-tenant.js
 */

const API_URL = process.env.NEXT_PUBLIC_CALL_IQ_API_URL || 'http://localhost:8000';

const testTenant = {
  business_name: 'Test HVAC Company',
  phone_number: '+19193715609',
  services_offered: ['HVAC', 'Plumbing', 'Electrical'],
  tone: 'professional',
  question_flow: [
    'What service are you calling about?',
    'When would you like us to schedule your appointment?',
    'Can you share any specifics or urgent details?'
  ],
  integrations: {
    zapier: {
      enabled: false
    }
  }
};

async function createTestTenant() {
  console.log('🚀 Creating test voice tenant...\n');
  console.log('API URL:', API_URL);
  console.log('Tenant Config:', JSON.stringify(testTenant, null, 2));
  console.log('\n' + '='.repeat(60) + '\n');

  try {
    const response = await fetch(`${API_URL}/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testTenant),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        errorData?.detail || 
        errorData?.error || 
        `HTTP ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json();
    
    console.log('✅ Test tenant created successfully!\n');
    console.log('Tenant ID:', data.id);
    console.log('Business Name:', data.business_name);
    console.log('Phone Number:', data.phone_number);
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Go to: http://localhost:3000/settings');
    console.log('2. Find "Tenant Configuration" section');
    console.log('3. Paste this ID:', data.id);
    console.log('4. Click "Save"');
    console.log('5. Visit your dashboard: http://localhost:3000/dashboard\n');
    console.log('='.repeat(60) + '\n');
    
    return data;
  } catch (error) {
    console.error('❌ Error creating tenant:', error.message);
    console.error('\n💡 Make sure:');
    console.error('  1. The Call IQ backend is running on port 8000');
    console.error('  2. Your .env file has the correct API URL');
    console.error('  3. The phone number is not already in use\n');
    process.exit(1);
  }
}

// Run the script
createTestTenant();

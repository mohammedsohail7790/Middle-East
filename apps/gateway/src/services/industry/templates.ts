/**
 * Industry Templates
 * Production-ready industry-specific configurations for Call IQ.
 * Each industry defines: default prompt, services, working hours, KPIs, lead fields, and business rules.
 */
import { buildExtendedIndustryTemplates } from './extended-templates.js';

export interface IndustryKPI {
    key: string;
    label: string;
    icon: string;
    unit: string;
}

export interface LeadField {
    key: string;
    label: string;
    type: 'text' | 'phone' | 'email' | 'date' | 'select';
    required: boolean;
    options?: string[];
}

export interface IndustryTemplate {
    id: string;
    name: string;
    description: string;
    icon: string;
    defaultServices: string[];
    defaultWorkingHours: string;
    diagnosticFee: number;
    systemPrompt: string;
    greeting: string;
    kpis: IndustryKPI[];
    leadFields: LeadField[];
    callHandlingMode: 'message' | 'transfer' | 'both';
    transferMessage: string;
    industryQuestions: string[];
}

export const INDUSTRY_TEMPLATES: Record<string, IndustryTemplate> = {
    hvac: {
        id: 'hvac',
        name: 'HVAC & Climate Control',
        description: 'Heating, ventilation, and air conditioning services',
        icon: '🌡️',
        defaultServices: ['AC repair', 'AC installation', 'HVAC maintenance', 'Emergency HVAC service', 'Furnace repair', 'Duct cleaning'],
        defaultWorkingHours: 'Monday–Friday: 8 AM – 6 PM\nSaturday: 9 AM – 2 PM\nSunday: Closed',
        diagnosticFee: 125,
        systemPrompt: `You are an AI phone receptionist for an HVAC company. You handle calls about AC repair, installation, maintenance, and emergencies.

Key facts:
- Service call/diagnostic fee: $125 per visit (covers trip and inspection, waived if customer proceeds with repair)
- Same-day service may be available depending on schedule
- Appointments typically within 24-48 hours
- For emergencies (no AC in summer, gas leak, no heat in winter), prioritize immediate dispatch

When booking:
- Ask about the issue (not cooling, making noise, leaking, etc.)
- Note if it's urgent/emergency
- Collect: name, phone, address, type of system, preferred time
- Always confirm the diagnostic fee before booking`,
        greeting: "Thanks for calling [Business]. This is [Agent]. How can I help you?",
        kpis: [
            { key: 'service_calls_booked', label: 'Service Calls Booked', icon: '📋', unit: 'count' },
            { key: 'emergency_calls', label: 'Emergency Calls', icon: '🚨', unit: 'count' },
            { key: 'installations_quoted', label: 'Installation Quotes', icon: '💰', unit: 'count' },
            { key: 'avg_response_time', label: 'Avg Response Time', icon: '⏱️', unit: 'minutes' },
        ],
        leadFields: [
            { key: 'name', label: 'Customer Name', type: 'text', required: true },
            { key: 'phone', label: 'Phone', type: 'phone', required: true },
            { key: 'address', label: 'Service Address', type: 'text', required: true },
            { key: 'service_type', label: 'Service Type', type: 'select', required: true, options: ['AC Repair', 'AC Installation', 'Maintenance', 'Emergency', 'Furnace Repair', 'Duct Cleaning', 'Other'] },
            { key: 'system_type', label: 'System Type', type: 'select', required: false, options: ['Central AC', 'Split System', 'Heat Pump', 'Furnace', 'Package Unit', 'Not Sure'] },
            { key: 'preferred_time', label: 'Preferred Time', type: 'date', required: false },
            { key: 'issue_description', label: 'Issue Description', type: 'text', required: false },
        ],
        callHandlingMode: 'both',
        transferMessage: "I'm going to transfer you to one of our technicians now. One moment please.",
        industryQuestions: [
            'What type of system are you having trouble with?',
            'Is this an emergency or routine service?',
            'What is your service address?',
        ],
    },
    plumbing: {
        id: 'plumbing',
        name: 'Plumbing Services',
        description: 'Residential and commercial plumbing repair and installation',
        icon: '🔧',
        defaultServices: ['Drain cleaning', 'Pipe repair', 'Water heater service', 'Toilet repair', 'Leak detection', 'Emergency plumbing'],
        defaultWorkingHours: 'Monday–Friday: 7 AM – 6 PM\nSaturday: 8 AM – 3 PM\nSunday: Emergency only',
        diagnosticFee: 125,
        systemPrompt: `You are an AI phone receptionist for a plumbing company. You handle calls about plumbing repairs, installations, and emergencies.

Key facts:
- Service call fee: $125 per visit (covers trip and diagnosis, waived if customer proceeds with repair)
- Same-day service available for most calls
- Emergency plumbing available 24/7 (flooding, burst pipes, sewer backup)
- Free estimates provided on-site after inspection

When booking:
- Ask about the plumbing issue (leak, clog, no hot water, etc.)
- Identify if it's an emergency (active flooding, burst pipe, sewage backup)
- Collect: name, phone, address, issue description, preferred time
- Always confirm the service call fee before booking`,
        greeting: "Thanks for calling [Business]. I can help schedule a plumber, answer questions, or connect you with our dispatch team. How can I help you?",
        kpis: [
            { key: 'service_calls_booked', label: 'Service Calls Booked', icon: '📋', unit: 'count' },
            { key: 'emergency_calls', label: 'Emergency Calls', icon: '🚨', unit: 'count' },
            { key: 'job_value_avg', label: 'Avg Job Value', icon: '💰', unit: 'dollars' },
            { key: 'response_time', label: 'Dispatch Response Time', icon: '⏱️', unit: 'minutes' },
        ],
        leadFields: [
            { key: 'name', label: 'Customer Name', type: 'text', required: true },
            { key: 'phone', label: 'Phone', type: 'phone', required: true },
            { key: 'address', label: 'Service Address', type: 'text', required: true },
            { key: 'issue_type', label: 'Issue Type', type: 'select', required: true, options: ['Drain/ Clog', 'Leak', 'Water Heater', 'Pipe Repair', 'Toilet', 'Sewer Line', 'Emergency', 'Other'] },
            { key: 'is_emergency', label: 'Emergency?', type: 'select', required: true, options: ['Yes', 'No'] },
            { key: 'preferred_time', label: 'Preferred Time', type: 'date', required: false },
        ],
        callHandlingMode: 'both',
        transferMessage: "I'm transferring you to a plumber now. One moment please.",
        industryQuestions: [
            'Is there any active leaking or flooding right now?',
            'What is your service address?',
        ],
    },
    electrical: {
        id: 'electrical',
        name: 'Electrical Services',
        description: 'Residential and commercial electrical repair and installation',
        icon: '⚡',
        defaultServices: ['Electrical repair', 'Panel upgrade', 'Wiring', 'Lighting installation', 'EV charger installation', 'Emergency electrical'],
        defaultWorkingHours: 'Monday–Friday: 7 AM – 5 PM\nSaturday: 8 AM – 1 PM\nSunday: Closed',
        diagnosticFee: 125,
        systemPrompt: `You are an AI phone receptionist for an electrical services company. You handle calls about electrical repairs, installations, and emergencies.

Key facts:
- Service call fee: $125 per visit (covers trip and diagnosis)
- Licensed, bonded, and insured electricians
- Emergency electrical service available
- Free estimates for larger projects

When booking:
- Ask about the electrical issue
- Identify if it's an emergency (sparking, burning smell, power outage)
- Collect: name, phone, address, issue description, preferred time
- Always confirm the service call fee before booking`,
        greeting: "Thanks for calling [Business]. I can help schedule an electrician, answer questions, or connect you with our team. What do you need help with?",
        kpis: [
            { key: 'service_calls', label: 'Service Calls', icon: '📋', unit: 'count' },
            { key: 'emergency_calls', label: 'Emergency Calls', icon: '🚨', unit: 'count' },
            { key: 'ev_charger_installs', label: 'EV Charger Installs', icon: '🔌', unit: 'count' },
            { key: 'project_quotes', label: 'Project Quotes', icon: '💰', unit: 'count' },
        ],
        leadFields: [
            { key: 'name', label: 'Customer Name', type: 'text', required: true },
            { key: 'phone', label: 'Phone', type: 'phone', required: true },
            { key: 'address', label: 'Service Address', type: 'text', required: true },
            { key: 'service_type', label: 'Service Type', type: 'select', required: true, options: ['Repair', 'Panel Upgrade', 'Wiring', 'Lighting', 'EV Charger', 'Emergency', 'Other'] },
            { key: 'property_type', label: 'Property Type', type: 'select', required: false, options: ['Residential', 'Commercial', 'Industrial'] },
            { key: 'preferred_time', label: 'Preferred Time', type: 'date', required: false },
        ],
        callHandlingMode: 'both',
        transferMessage: "I'm connecting you to an electrician now. One moment please.",
        industryQuestions: [
            'Are you experiencing any sparking or burning smells?',
            'Is this residential or commercial?',
        ],
    },
    real_estate: {
        id: 'real_estate',
        name: 'Real Estate',
        description: 'Real estate agency, property management, and leasing',
        icon: '🏠',
        defaultServices: ['Buyer consultation', 'Seller consultation', 'Property viewing', 'Property management', 'Leasing', 'Market analysis'],
        defaultWorkingHours: 'Monday–Friday: 9 AM – 7 PM\nSaturday: 10 AM – 5 PM\nSunday: By appointment only',
        diagnosticFee: 0,
        systemPrompt: `You are an AI receptionist for a real estate agency. You handle inquiries from buyers, sellers, landlords, and tenants.

Key facts:
- Free consultations for buyers and sellers
- Property viewings available by appointment
- Property management services available
- Market analysis provided at no cost

When handling calls:
- Determine if caller is a buyer, seller, or tenant
- For buyers: ask about budget, location preferences, property type
- For sellers: ask about property details, timeline, reason for selling
- For tenants: ask about rental needs, budget, move-in date
- Collect: name, phone, email, inquiry type, preferred contact time`,
        greeting: "Thank you for calling [Business]. I can help you schedule a consultation, property viewing, or connect you with an agent. How can I assist you today?",
        kpis: [
            { key: 'buyer_leads', label: 'Buyer Leads', icon: '🏠', unit: 'count' },
            { key: 'seller_leads', label: 'Seller Leads', icon: '📝', unit: 'count' },
            { key: 'viewings_booked', label: 'Viewings Booked', icon: '👁️', unit: 'count' },
            { key: 'consultations', label: 'Consultations', icon: '🤝', unit: 'count' },
        ],
        leadFields: [
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'phone', label: 'Phone', type: 'phone', required: true },
            { key: 'email', label: 'Email', type: 'email', required: true },
            { key: 'inquiry_type', label: 'Inquiry Type', type: 'select', required: true, options: ['Buying', 'Selling', 'Renting', 'Property Management', 'Market Analysis', 'General'] },
            { key: 'budget', label: 'Budget Range', type: 'text', required: false },
            { key: 'preferred_time', label: 'Preferred Contact Time', type: 'date', required: false },
            { key: 'notes', label: 'Notes', type: 'text', required: false },
        ],
        callHandlingMode: 'both',
        transferMessage: "I'm connecting you to one of our agents now. One moment please.",
        industryQuestions: [
            'Are you looking to buy, sell, or rent?',
            'What area or neighborhood are you interested in?',
        ],
    },
    salon: {
        id: 'salon',
        name: 'Salon & Beauty',
        description: 'Hair salon, spa, and beauty services',
        icon: '💇',
        defaultServices: ['Haircut', 'Color', 'Highlights', 'Blowout', 'Extensions', 'Bridal styling', 'Balayage', 'Keratin treatment'],
        defaultWorkingHours: 'Tuesday–Saturday: 9 AM – 7 PM\nSunday: 10 AM – 4 PM\nMonday: Closed',
        diagnosticFee: 0,
        systemPrompt: `You are an AI receptionist for a salon. You handle appointment bookings, service inquiries, and cancellations.

Key facts:
- Appointments recommended, walk-ins welcome based on availability
- Consultation required for major color changes and extensions
- 24-hour cancellation notice required
- Deposits may be required for bridal and special event bookings

When booking:
- Ask about desired service(s)
- For new clients: ask about hair history (previous color, chemicals)
- Collect: name, phone, preferred stylist (if any), date/time preference
- Confirm service duration and pricing range`,
        greeting: "Thanks for calling [Business]. This is [Agent]. How can I help you?",
        kpis: [
            { key: 'appointments_booked', label: 'Appointments Booked', icon: '📅', unit: 'count' },
            { key: 'new_clients', label: 'New Clients', icon: '👤', unit: 'count' },
            { key: 'repeat_clients', label: 'Repeat Clients', icon: '🔄', unit: 'count' },
            { key: 'avg_service_value', label: 'Avg Service Value', icon: '💰', unit: 'dollars' },
        ],
        leadFields: [
            { key: 'name', label: 'Client Name', type: 'text', required: true },
            { key: 'phone', label: 'Phone', type: 'phone', required: true },
            { key: 'email', label: 'Email', type: 'email', required: false },
            { key: 'service', label: 'Service', type: 'select', required: true, options: ['Haircut', 'Color', 'Highlights', 'Blowout', 'Extensions', 'Bridal', 'Balayage', 'Keratin', 'Other'] },
            { key: 'preferred_stylist', label: 'Preferred Stylist', type: 'text', required: false },
            { key: 'is_new_client', label: 'New Client?', type: 'select', required: true, options: ['Yes', 'No'] },
            { key: 'preferred_date', label: 'Preferred Date', type: 'date', required: false },
        ],
        callHandlingMode: 'message',
        transferMessage: "Let me connect you with a stylist. One moment please.",
        industryQuestions: [
            'Have you visited us before?',
            'What service are you interested in today?',
        ],
    },
    law_firm: {
        id: 'law_firm',
        name: 'Law Firm',
        description: 'Legal services, consultations, and case management',
        icon: '⚖️',
        defaultServices: ['Personal injury', 'Family law', 'Criminal defense', 'Business law', 'Estate planning', 'Real estate law', 'Immigration'],
        defaultWorkingHours: 'Monday–Friday: 8:30 AM – 5:30 PM\nSaturday: By appointment\nSunday: Closed',
        diagnosticFee: 0,
        systemPrompt: `You are an AI receptionist for a law firm. You handle intake calls, consultation scheduling, and general inquiries.

Key facts:
- Free initial consultations for personal injury cases
- Consultation fees vary by practice area
- All information is confidential
- After-hours: message taking only, urgent matters return call next business day

When handling calls:
- Determine the area of law needed
- For personal injury: ask about incident date, type of injury, insurance status
- For other areas: ask brief description, urgency level
- Collect: name, phone, email, area of law, brief description, preferred consultation time
- Do NOT provide legal advice — only schedule consultations`,
        greeting: "Thank you for calling [Business]. I can schedule a consultation or connect you with our intake team. How can I assist you?",
        kpis: [
            { key: 'intake_calls', label: 'Intake Calls', icon: '📞', unit: 'count' },
            { key: 'consultations_booked', label: 'Consultations Booked', icon: '📅', unit: 'count' },
            { key: 'cases_opened', label: 'Cases Opened', icon: '📁', unit: 'count' },
            { key: 'conversion_rate', label: 'Consultation to Case Rate', icon: '📈', unit: 'percent' },
        ],
        leadFields: [
            { key: 'name', label: 'Full Name', type: 'text', required: true },
            { key: 'phone', label: 'Phone', type: 'phone', required: true },
            { key: 'email', label: 'Email', type: 'email', required: true },
            { key: 'area_of_law', label: 'Area of Law', type: 'select', required: true, options: ['Personal Injury', 'Family Law', 'Criminal Defense', 'Business Law', 'Estate Planning', 'Real Estate Law', 'Immigration', 'Other'] },
            { key: 'incident_date', label: 'Incident Date (if applicable)', type: 'date', required: false },
            { key: 'urgency', label: 'Urgency', type: 'select', required: true, options: ['Urgent', 'Standard', 'Planning Ahead'] },
            { key: 'preferred_date', label: 'Preferred Consultation Date', type: 'date', required: false },
        ],
        callHandlingMode: 'both',
        transferMessage: "I'm connecting you to our intake coordinator. One moment please.",
        industryQuestions: [
            'Can you briefly describe your legal matter?',
            'When did this issue arise?',
        ],
    },
    clinic: {
        id: 'clinic',
        name: 'Medical Clinic',
        description: 'Primary care, urgent care, and specialty medical services',
        icon: '🏥',
        defaultServices: ['Primary care', 'Urgent care', 'Annual physical', 'Lab work', 'Vaccinations', 'Specialist referral', 'Telehealth'],
        defaultWorkingHours: 'Monday–Friday: 8 AM – 6 PM\nSaturday: 9 AM – 1 PM\nSunday: Closed (urgent care referrals available)',
        diagnosticFee: 0,
        systemPrompt: `You are an AI receptionist for a medical clinic. You handle appointment scheduling, patient inquiries, and basic triage.

Key facts:
- New patients welcome — registration forms available online
- Most insurance plans accepted
- Same-day urgent appointments available
- Telehealth visits available for follow-ups

When handling calls:
- Determine if patient is new or existing
- For appointments: ask about reason for visit, preferred date/time
- For urgent symptoms: transfer to nurse triage line
- Collect: name, phone, date of birth (existing patients), insurance type, reason for visit
- Do NOT provide medical advice — only schedule and direct`,
        greeting: "Thank you for calling [Business]. I can help you schedule an appointment, answer questions, or connect you with our care team. How can I help you?",
        kpis: [
            { key: 'appointments_booked', label: 'Appointments Booked', icon: '📅', unit: 'count' },
            { key: 'new_patients', label: 'New Patients', icon: '👤', unit: 'count' },
            { key: 'urgent_care_visits', label: 'Urgent Care Visits', icon: '🚑', unit: 'count' },
            { key: 'telehealth_visits', label: 'Telehealth Visits', icon: '💻', unit: 'count' },
        ],
        leadFields: [
            { key: 'name', label: 'Patient Name', type: 'text', required: true },
            { key: 'phone', label: 'Phone', type: 'phone', required: true },
            { key: 'dob', label: 'Date of Birth', type: 'date', required: false },
            { key: 'is_new_patient', label: 'New Patient?', type: 'select', required: true, options: ['Yes', 'No'] },
            { key: 'visit_type', label: 'Visit Type', type: 'select', required: true, options: ['Primary Care', 'Urgent Care', 'Annual Physical', 'Lab Work', 'Vaccination', 'Specialist Referral', 'Telehealth', 'Other'] },
            { key: 'insurance', label: 'Insurance Type', type: 'text', required: false },
            { key: 'preferred_date', label: 'Preferred Date', type: 'date', required: false },
        ],
        callHandlingMode: 'both',
        transferMessage: "I'm connecting you to our care team. One moment please.",
        industryQuestions: [
            'Are you a new patient with us?',
            'What is the reason for your visit?',
        ],
    },
    general: {
        id: 'general',
        name: 'General Business',
        description: 'Custom services — uses tenant settings and knowledge base, not trade-specific defaults',
        icon: '💼',
        defaultServices: [],
        defaultWorkingHours: 'Monday–Friday: 9 AM – 5 PM',
        diagnosticFee: 0,
        systemPrompt: `You are an AI phone receptionist for [Business]. Answer using ONLY this business's services, description, and knowledge base — never assume HVAC, plumbing, medical, or other trade defaults unless the caller or business profile says so.

When handling calls:
- Explain what the company does in plain language based on their profile
- Book appointments or take messages when appropriate
- Use search_knowledge_base for specifics you do not already know
- Do not invent services the business does not offer`,
        greeting: 'Thank you for calling [Business]. How can I help you today?',
        kpis: [
            { key: 'calls_handled', label: 'Calls Handled', icon: '📞', unit: 'count' },
            { key: 'leads_captured', label: 'Leads Captured', icon: '👤', unit: 'count' },
        ],
        leadFields: [
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'phone', label: 'Phone', type: 'phone', required: true },
            { key: 'interest', label: 'Interest / Request', type: 'text', required: false },
        ],
        callHandlingMode: 'both',
        transferMessage: "I'll connect you with someone who can help. One moment please.",
        industryQuestions: [
            'What can we help you with today?',
            'May I get your name and callback number?',
        ],
    },
};

Object.assign(INDUSTRY_TEMPLATES, buildExtendedIndustryTemplates());

export const INDUSTRY_KEYS = Object.keys(INDUSTRY_TEMPLATES);

export function getIndustryTemplate(industry: string): IndustryTemplate | undefined {
    return INDUSTRY_TEMPLATES[industry];
}

export function getAllIndustries(): IndustryTemplate[] {
    return Object.values(INDUSTRY_TEMPLATES);
}

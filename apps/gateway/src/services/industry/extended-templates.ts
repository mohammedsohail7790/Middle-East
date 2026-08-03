/**
 * Extended industry templates (42) — merged with core 8 for 50 total.
 */
import type { IndustryTemplate } from './templates.js';

type IndustrySeed = {
  id: string;
  name: string;
  description: string;
  icon: string;
  services: string[];
  trade: string;
  diagnosticFee?: number;
  callHandlingMode?: IndustryTemplate['callHandlingMode'];
};

function buildTemplate(seed: IndustrySeed): IndustryTemplate {
  const trade = seed.trade;
  return {
    id: seed.id,
    name: seed.name,
    description: seed.description,
    icon: seed.icon,
    defaultServices: seed.services,
    defaultWorkingHours: 'Monday–Friday: 8 AM – 6 PM\nSaturday: 9 AM – 1 PM\nSunday: Closed',
    diagnosticFee: seed.diagnosticFee ?? 95,
    systemPrompt: `You are an AI phone receptionist for a ${trade} business. Answer professionally using only this company's services and knowledge base.

When handling calls:
- Qualify the caller's need and urgency
- Capture name, phone, and service address when relevant
- Book appointments or take detailed messages
- Transfer emergencies when appropriate
- Never invent services the business does not offer`,
    greeting: `Thank you for calling [Business]. How can I help you with your ${trade} needs today?`,
    kpis: [
      { key: 'calls_handled', label: 'Calls Handled', icon: '📞', unit: 'count' },
      { key: 'leads_captured', label: 'Leads Captured', icon: '👤', unit: 'count' },
      { key: 'appointments_booked', label: 'Appointments', icon: '📅', unit: 'count' },
    ],
    leadFields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'phone', label: 'Phone', type: 'phone', required: true },
      { key: 'service', label: 'Service Needed', type: 'text', required: true },
      { key: 'address', label: 'Service Address', type: 'text', required: false },
    ],
    callHandlingMode: seed.callHandlingMode ?? 'both',
    transferMessage: "I'll connect you with our team right away. One moment please.",
    industryQuestions: [
      'What service do you need help with?',
      'Is this an emergency or can we schedule a visit?',
    ],
  };
}

const SEEDS: IndustrySeed[] = [
  { id: 'roofing', name: 'Roofing Contractors', description: 'Roof repair, replacement, and storm damage', icon: '🏠', services: ['Roof repair', 'Roof replacement', 'Storm damage', 'Gutter service', 'Inspections'], trade: 'roofing' },
  { id: 'landscaping', name: 'Landscaping', description: 'Lawn care and outdoor maintenance', icon: '🌿', services: ['Lawn mowing', 'Landscape design', 'Tree trimming', 'Irrigation', 'Seasonal cleanup'], trade: 'landscaping' },
  { id: 'cleaning', name: 'Home Cleaning', description: 'Residential and commercial cleaning', icon: '🧹', services: ['Deep cleaning', 'Move-out cleaning', 'Recurring service', 'Commercial cleaning'], trade: 'cleaning' },
  { id: 'pest_control', name: 'Pest Control', description: 'Pest inspection and treatment', icon: '🐜', services: ['Inspection', 'Treatment', 'Termite control', 'Rodent control', 'Prevention plans'], trade: 'pest control' },
  { id: 'locksmith', name: 'Locksmith', description: 'Lockouts and security hardware', icon: '🔐', services: ['Emergency lockout', 'Rekey', 'Lock install', 'Commercial locks', 'Smart locks'], trade: 'locksmith', diagnosticFee: 75 },
  { id: 'moving', name: 'Moving Company', description: 'Local and long-distance moves', icon: '📦', services: ['Local move', 'Long distance', 'Packing', 'Storage', 'Commercial move'], trade: 'moving' },
  { id: 'veterinary', name: 'Veterinary Practice', description: 'Pet care and emergency vet services', icon: '🐾', services: ['Wellness exam', 'Vaccinations', 'Surgery consult', 'Emergency visit', 'Grooming referral'], trade: 'veterinary clinic' },
  { id: 'staffing', name: 'Staffing Agency', description: 'Recruiting and temp staffing', icon: '👥', services: ['Temp staffing', 'Direct hire', 'Executive search', 'Contract roles'], trade: 'staffing' },
  { id: 'accounting', name: 'Accounting Firm', description: 'Tax, bookkeeping, and advisory', icon: '📊', services: ['Tax prep', 'Bookkeeping', 'Payroll', 'Advisory', 'Audit support'], trade: 'accounting' },
  { id: 'education', name: 'Education Provider', description: 'Schools, tutoring, and training', icon: '🎓', services: ['Enrollment', 'Tutoring', 'Programs', 'Financial aid info', 'Campus tours'], trade: 'education' },
  { id: 'retail', name: 'Retail Business', description: 'Store orders and customer service', icon: '🛍️', services: ['Order status', 'Returns', 'Product questions', 'Appointments', 'Pickup'], trade: 'retail' },
  { id: 'transportation', name: 'Transportation', description: 'Fleet and ride services', icon: '🚚', services: ['Booking', 'Dispatch', 'Quotes', 'Fleet service', 'Delivery'], trade: 'transportation' },
  { id: 'agency', name: 'Marketing Agency', description: 'Creative and digital services', icon: '📣', services: ['Discovery call', 'SEO', 'Paid ads', 'Web design', 'Branding'], trade: 'agency' },
  { id: 'auto_repair', name: 'Auto Repair', description: 'Vehicle service and repair', icon: '🚗', services: ['Oil change', 'Brake service', 'Diagnostics', 'Tire service', 'Emergency tow referral'], trade: 'auto repair' },
  { id: 'dental', name: 'Dental Practice', description: 'General and cosmetic dentistry', icon: '🦷', services: ['Cleaning', 'Emergency dental', 'Cosmetic consult', 'Orthodontics referral'], trade: 'dental practice' },
  { id: 'chiropractic', name: 'Chiropractic Clinic', description: 'Spine and musculoskeletal care', icon: '💆', services: ['New patient', 'Adjustment', 'Therapy consult', 'Insurance verification'], trade: 'chiropractic clinic' },
  { id: 'insurance', name: 'Insurance Agency', description: 'Personal and commercial insurance', icon: '🛡️', services: ['Quote', 'Policy change', 'Claims guidance', 'Renewal'], trade: 'insurance' },
  { id: 'mortgage', name: 'Mortgage Broker', description: 'Home loans and refinancing', icon: '🏦', services: ['Pre-approval', 'Refinance', 'Purchase loan', 'Rate consult'], trade: 'mortgage' },
  { id: 'property_management', name: 'Property Management', description: 'Residential and commercial properties', icon: '🏢', services: ['Tenant inquiry', 'Maintenance request', 'Leasing', 'Owner services'], trade: 'property management' },
  { id: 'pool_service', name: 'Pool Service', description: 'Pool maintenance and repair', icon: '🏊', services: ['Weekly service', 'Repair', 'Opening/closing', 'Equipment install'], trade: 'pool service' },
  { id: 'garage_door', name: 'Garage Door', description: 'Garage door repair and install', icon: '🚪', services: ['Spring repair', 'Opener install', 'New door', 'Emergency service'], trade: 'garage door' },
  { id: 'appliance_repair', name: 'Appliance Repair', description: 'Home appliance service', icon: '🔧', services: ['Washer/dryer', 'Refrigerator', 'Oven', 'Dishwasher', 'Same-day service'], trade: 'appliance repair' },
  { id: 'carpet_cleaning', name: 'Carpet Cleaning', description: 'Carpet and upholstery cleaning', icon: '🧼', services: ['Residential carpet', 'Commercial', 'Upholstery', 'Stain treatment'], trade: 'carpet cleaning' },
  { id: 'window_cleaning', name: 'Window Cleaning', description: 'Residential and commercial windows', icon: '🪟', services: ['Residential', 'Commercial', 'Pressure wash combo', 'Recurring service'], trade: 'window cleaning' },
  { id: 'junk_removal', name: 'Junk Removal', description: 'Haul-away and cleanout services', icon: '🗑️', services: ['Residential haul', 'Estate cleanout', 'Construction debris', 'Donation pickup'], trade: 'junk removal' },
  { id: 'tree_service', name: 'Tree Service', description: 'Tree trimming and removal', icon: '🌳', services: ['Trimming', 'Removal', 'Stump grinding', 'Emergency storm'], trade: 'tree service' },
  { id: 'fencing', name: 'Fencing Contractor', description: 'Fence install and repair', icon: '🪵', services: ['Install', 'Repair', 'Gate service', 'Commercial fencing'], trade: 'fencing' },
  { id: 'painting', name: 'Painting Contractor', description: 'Interior and exterior painting', icon: '🎨', services: ['Interior', 'Exterior', 'Cabinet refinishing', 'Commercial painting'], trade: 'painting' },
  { id: 'drywall', name: 'Drywall Contractor', description: 'Drywall install and repair', icon: '🧱', services: ['Repair', 'Install', 'Texture', 'Water damage'], trade: 'drywall' },
  { id: 'flooring', name: 'Flooring Contractor', description: 'Hardwood, tile, and carpet install', icon: '🪵', services: ['Hardwood', 'Tile', 'Carpet', 'LVP install', 'Refinish'], trade: 'flooring' },
  { id: 'masonry', name: 'Masonry', description: 'Brick, stone, and concrete work', icon: '🧱', services: ['Brick repair', 'Stone work', 'Chimney', 'Retaining walls'], trade: 'masonry' },
  { id: 'concrete', name: 'Concrete Contractor', description: 'Driveways, patios, and foundations', icon: '🏗️', services: ['Driveway', 'Patio', 'Foundation', 'Stamped concrete'], trade: 'concrete' },
  { id: 'it_services', name: 'IT Services', description: 'Managed IT and support', icon: '💻', services: ['Help desk', 'On-site support', 'Cybersecurity', 'Cloud migration'], trade: 'IT services' },
  { id: 'photography', name: 'Photography Studio', description: 'Portrait and event photography', icon: '📷', services: ['Portrait', 'Wedding', 'Commercial', 'Headshots'], trade: 'photography' },
  { id: 'catering', name: 'Catering', description: 'Event and corporate catering', icon: '🍽️', services: ['Event catering', 'Corporate lunch', 'Wedding menu', 'Delivery'], trade: 'catering' },
  { id: 'restaurant', name: 'Restaurant', description: 'Reservations and takeout', icon: '🍴', services: ['Reservations', 'Takeout', 'Catering inquiry', 'Private events'], trade: 'restaurant' },
  { id: 'fitness', name: 'Fitness Studio', description: 'Gym and personal training', icon: '💪', services: ['Membership', 'Personal training', 'Class schedule', 'Trial session'], trade: 'fitness studio' },
  { id: 'daycare', name: 'Daycare Center', description: 'Childcare enrollment and tours', icon: '👶', services: ['Enrollment', 'Tour', 'Billing question', 'Schedule change'], trade: 'daycare' },
  { id: 'tutoring', name: 'Tutoring Center', description: 'Academic tutoring programs', icon: '📚', services: ['Assessment', 'Program enrollment', 'Schedule', 'Parent consult'], trade: 'tutoring' },
  { id: 'nonprofit', name: 'Nonprofit Organization', description: 'Donations and program intake', icon: '🤝', services: ['Donations', 'Volunteer intake', 'Program info', 'Event registration'], trade: 'nonprofit' },
  { id: 'construction', name: 'General Contractor', description: 'Residential and commercial construction', icon: '🏗️', services: ['Renovation', 'New build consult', 'Estimate', 'Project scheduling'], trade: 'construction' },
  { id: 'solar', name: 'Solar Installer', description: 'Solar panel install and service', icon: '☀️', services: ['Site survey', 'Install quote', 'Battery storage', 'Maintenance'], trade: 'solar installation' },
];

export function buildExtendedIndustryTemplates(): Record<string, IndustryTemplate> {
  const out: Record<string, IndustryTemplate> = {};
  for (const seed of SEEDS) {
    out[seed.id] = buildTemplate(seed);
  }
  return out;
}

export const EXTENDED_INDUSTRY_COUNT = SEEDS.length;

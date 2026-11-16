// Ready-made automations register themselves here (see registry.ts).
import { getTemplate, registerTemplate } from '../registry.js';
import type { AutomationTemplate } from '../types.js';
import { leadToCrm } from './lead-to-crm.js';
import { missedCallFollowup } from './missed-call-followup.js';
import { hotLeadAlert } from './hot-lead-alert.js';
import { leadToSpreadsheet } from './lead-to-spreadsheet.js';
import { documentIntake } from './document-intake.js';
import { appointmentConfirmation } from './appointment-confirmation.js';
import { newBookingAlert } from './new-booking-alert.js';
import { leadWelcomeEmail } from './lead-welcome-email.js';
import { callSummaryEmail } from './call-summary-email.js';
import { appointmentToSpreadsheet } from './appointment-to-spreadsheet.js';
import { callLogToSpreadsheet } from './call-log-to-spreadsheet.js';

export const ALL_TEMPLATES: AutomationTemplate[] = [
  leadToCrm, missedCallFollowup, hotLeadAlert, leadToSpreadsheet, documentIntake,
  appointmentConfirmation, newBookingAlert, leadWelcomeEmail, callSummaryEmail, appointmentToSpreadsheet, callLogToSpreadsheet,
];

/** Registers the library; safe to call again (templates already registered are left alone). */
export function registerAllTemplates(): void {
  for (const t of ALL_TEMPLATES) if (!getTemplate(t.key)) registerTemplate(t);
}

registerAllTemplates();

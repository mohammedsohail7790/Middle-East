/**
 * Form 2, the audit questionnaire. This file is the single list of questions: the page is generated from it (see audit-form-page.ts), and the gateway accepts only these
 * ids, so a question cannot be added to one side and forgotten on the other. Questions the client cannot answer can be left blank.
 * The questions are Hk's (10 November 2026): six short sections, answered in the client's own words.
 */
export type QuestionType = 'text' | 'textarea' | 'select';

export interface Question {
  id: string;
  label: string;
  type: QuestionType;
  hint?: string;
  options?: string[];
}

export interface Section {
  id: string;
  title: string;
  intro?: string;
  /** Blocks that repeat: the page shows the first, and "Add another" for the rest. Not used by the current questionnaire, but the page generator still supports it. */
  repeat?: { noun: string; count: number; required: number };
  questions: Question[];
}

const q = (id: string, label: string, type: QuestionType = 'text', extra: Partial<Question> = {}): Question => ({ id, label, type, ...extra });

export const AUDIT_SECTIONS: Section[] = [
  {
    id: 'overview',
    title: 'A. Business overview and goals',
    questions: [
      q('a_company', 'What is your company name and what is your core business?', 'textarea'),
      q('a_contact', 'Who is the primary contact person for this project?', 'text'),
      q('a_goal', 'What is the main goal or outcome you want to achieve with this automation or AI project?', 'textarea', { hint: 'For example: reduce manual data entry, or speed up customer support response times.' }),
      q('a_success', 'What does success look like for this project?', 'textarea', { hint: 'For example: saving 10 hours a week, zero data entry errors, or handling 500 more inquiries a month.' }),
    ],
  },
  {
    id: 'process',
    title: 'B. Current process and workflows',
    questions: [
      q('b_process', 'How is this process currently handled today?', 'textarea', { hint: 'Please walk us through it step by step.' }),
      q('b_hours', 'How much time does your team spend on this manual process each week?', 'text'),
      q('b_volume', 'Roughly how many transactions, documents or customer inquiries do you process per month?', 'text'),
      q('b_format', 'What percentage of these items follow a standard format, and what percentage are messy or unpredictable?', 'textarea', { hint: 'Standard: uniform invoices, structured forms. Messy: handwritten notes, random emails.' }),
      q('b_errors', 'What is your current error rate or manual exception rate, and where does the process usually break down?', 'textarea'),
    ],
  },
  {
    id: 'systems',
    title: 'C. Software, systems and data',
    questions: [
      q('c_tools', 'What software, CRM or tools are you currently using to run this process?', 'textarea'),
      q('c_api', 'Are your current software tools cloud-based with accessible APIs or webhooks, or are they older on-premise legacy systems?', 'textarea'),
      q('c_access', 'Do you currently have developer documentation, admin access, or IT support available to help connect these tools?', 'textarea'),
      q('c_data', 'Where is your data currently stored?', 'textarea', { hint: 'For example: Google Sheets, a cloud database, local servers, or physical filing cabinets.' }),
    ],
  },
  {
    id: 'security',
    title: 'D. Security, privacy and compliance',
    questions: [
      q('d_sensitive', 'Does this process involve sensitive or regulated data?', 'textarea', { hint: 'For example: customer financial records, health data, or passwords.' }),
      q('d_rules', 'Are there any local data privacy laws, industry regulations or company policies we need to follow?', 'textarea', { hint: 'For example: UAE or KSA data regulations, or GDPR.' }),
      q('d_region', 'Do you require user data to be encrypted or hosted in a specific geographic region?', 'textarea'),
    ],
  },
  {
    id: 'oversight',
    title: 'E. Human oversight and exceptions',
    questions: [
      q('e_review', 'Can this workflow run fully automated from start to finish, or does a human need to review and approve certain steps?', 'textarea'),
      q('e_notify', 'If the system encounters an error or an unusual request, how should it notify your team?', 'textarea', { hint: 'For example: by email, Slack, or a dashboard alert.' }),
    ],
  },
  {
    id: 'timeline',
    title: 'F. Timeline, budget and next steps',
    questions: [
      q('f_sponsor', 'Who is the ultimate project sponsor or decision-maker for this build?', 'text'),
      q('f_deadline', 'What is your target go-live date or deadline for this project?', 'text'),
      q('f_budget', 'What is your allocated budget range for this build?', 'text', { hint: 'For example: under AED 10k, AED 10k to 30k, or AED 30k and above.' }),
      q('f_other', 'Are there any other specific requirements, constraints or tools you want us to keep in mind?', 'textarea'),
    ],
  },
];

export const AUDIT_QUESTIONS: Question[] = AUDIT_SECTIONS.flatMap((s) => s.questions);
export const AUDIT_FIELD_IDS: ReadonlySet<string> = new Set(AUDIT_QUESTIONS.map((x) => x.id));

/**
 * Form 2, the audit questionnaire. This file is the single list of questions: the page is generated from it (see audit-form-page.ts), and the gateway accepts only these
 * ids, so a question cannot be added to one side and forgotten on the other. Questions the client cannot answer can be left blank.
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
  /** Blocks that repeat (processes, systems): the page shows the first, and "Add another" for the rest. */
  repeat?: { noun: string; count: number; required: number };
  questions: Question[];
}

const q = (id: string, label: string, type: QuestionType = 'text', extra: Partial<Question> = {}): Question => ({ id, label, type, ...extra });
const YES_NO_UNSURE = ['Yes', 'No', 'Not sure'];

/** One block of the process questions, for process `n`. */
const processQuestions = (n: number): Question[] => [
  q(`p${n}_name`, 'What is it called, and what starts it?', 'text', { hint: 'For example: month-end invoicing, started when the month closes.' }),
  q(`p${n}_steps`, 'Walk us through the steps in order. Who does each, and which tool or paper do they use?', 'textarea'),
  q(`p${n}_volume`, 'How often does it happen (per day, week or month), and how long does one take from start to finish?'),
  q(`p${n}_people`, 'How many people touch it, and about how many hours a week in total?'),
  q(`p${n}_errors`, 'How often does it go wrong or need redoing, and what does a mistake cost?'),
  q(`p${n}_peaks`, 'Are there busy periods or deadlines? What happens when the person who does it is away?', 'textarea'),
  q(`p${n}_output`, 'What does the finished result look like, and who receives it?'),
  q(`p${n}_exceptions`, 'Are there odd cases that need a person to decide? How common are they?', 'textarea'),
  q(`p${n}_fixed`, 'What would "fixed" look like, in numbers?', 'text', { hint: 'For example: invoices out in 2 days instead of 6.' }),
];

/** One block of the system questions, for system `n`. */
const systemQuestions = (n: number): Question[] => [
  q(`s${n}_name`, 'Name and version, and what you use it for', 'text', { hint: 'Accounting, ERP, CRM, email, calendar, website or store, phone system, WhatsApp, spreadsheets, shared drive.' }),
  q(`s${n}_users`, 'How many people use it, and who administers it?'),
  q(`s${n}_hosting`, 'Is it in the cloud or on your own server?', 'select', { options: ['In the cloud', 'On our own server', 'Both', 'Not sure'] }),
  q(`s${n}_connect`, 'Can you export data, or does it connect to other tools (API, Zapier, built-in links)?', 'select', { options: ['It connects to other tools', 'We can export data only', 'Neither', 'Not sure'] }),
  q(`s${n}_quality`, 'How clean is the data?', 'select', { options: ['Tidy', 'Mostly tidy', 'Messy', 'Duplicated across places', 'Not sure'] }),
  q(`s${n}_records`, 'How many records are there (customers, products, invoices)?'),
  q(`s${n}_notes`, 'For an ERP: how customised is it, and does the vendor still support it? Anything else we should know?', 'textarea'),
];

export const PROCESS_COUNT = 3;
export const SYSTEM_COUNT = 6;

export const AUDIT_SECTIONS: Section[] = [
  {
    id: 'people',
    title: 'A. The people',
    questions: [
      q('a_legal', 'Company legal name, registered address and tax or VAT number', 'textarea', { hint: 'For the contract and the invoice.' }),
      q('a_signoff', 'Who signs off a project, who is our day-to-day contact, and who else must agree?', 'textarea'),
      q('a_owner', 'Who inside the company will own this after we finish, and how many hours a week could they give?'),
      q('a_it', 'Who looks after IT or the software, inside the company or outside?'),
    ],
  },
  {
    id: 'processes',
    title: 'B. The process that hurts most',
    intro: 'Start with the one that costs the most time or money. You can add up to three.',
    repeat: { noun: 'process', count: PROCESS_COUNT, required: 1 },
    questions: Array.from({ length: PROCESS_COUNT }, (_, i) => processQuestions(i + 1)).flat(),
  },
  {
    id: 'systems',
    title: 'C. Your systems and data',
    intro: 'One short block per system: accounting, ERP, CRM, email, calendar, website, phone system, WhatsApp, spreadsheets. You can add up to six.',
    repeat: { noun: 'system', count: SYSTEM_COUNT, required: 1 },
    questions: Array.from({ length: SYSTEM_COUNT }, (_, i) => systemQuestions(i + 1)).flat(),
  },
  {
    id: 'customers',
    title: 'D. Customers, calls and messages',
    intro: 'Only if this is part of the problem.',
    questions: [
      q('d_channels', 'Which channels, and roughly how many calls or messages per day?', 'textarea'),
      q('d_hours', 'Opening hours, and what happens after hours?'),
      q('d_languages', 'Which languages do your customers use (Arabic, English, others)?'),
      q('d_questions', 'The ten questions customers ask most', 'textarea'),
      q('d_escalation', 'What should always go to a person, and to whom?', 'textarea'),
      q('d_knowledge', 'Do you already have written answers, price lists or a FAQ?'),
      q('d_tone', 'The tone you want, and whether you record calls'),
    ],
  },
  {
    id: 'documents',
    title: 'E. Documents and information the AI would read',
    questions: [
      q('e_kinds', 'What kinds? (invoices, purchase orders, contracts, forms, emails, spreadsheets, reports)', 'textarea'),
      q('e_volume', 'How many per month, and in which languages?'),
      q('e_format', 'Are they digital, scanned or handwritten?', 'select', { options: ['Digital', 'Scanned', 'Handwritten', 'A mix'] }),
      q('e_layout', 'Do they follow a standard layout, or vary by supplier or customer?', 'select', { options: ['Standard layout', 'Varies a little', 'Varies a lot', 'Not sure'] }),
      q('e_samples', 'Can you send two or three redacted examples by replying to our email?', 'select', { options: YES_NO_UNSURE }),
    ],
  },
  {
    id: 'rules',
    title: 'F. Rules and risk',
    questions: [
      q('f_personal', 'Do you handle personal data? Which kinds: contact details, national ID numbers, health data, payment cards?', 'textarea'),
      q('f_rules', 'Does your industry have rules we must follow? (health, finance, legal, education, government)', 'textarea'),
      q('f_location', 'Must data stay in a country, or with a specific cloud provider?'),
      q('f_cloud_ai', 'Are you comfortable with a cloud AI service reading your documents?', 'select', { options: ['Yes', 'Yes, with some exceptions', 'No', 'Not sure'] }),
      q('f_approve', 'What must a person always approve before the AI acts, and who approves?', 'textarea'),
      q('f_disclose', 'Do customers need to be told they are talking to an AI?', 'select', { options: YES_NO_UNSURE }),
    ],
  },
  {
    id: 'goals',
    title: 'G. Goals, limits and the way you work',
    questions: [
      q('g_outcomes', 'Your top three outcomes in 90 days, each with a number if possible', 'textarea'),
      q('g_must', 'What is a must-have, and what is nice to have?', 'textarea'),
      q('g_deadline', 'Your deadline or busy season'),
      q('g_budget', 'The budget range for a first build, and how you prefer to pay (deposit, milestones)'),
      q('g_tried', 'What have you tried before, and why did it not work?', 'textarea'),
      q('g_team', 'How does your team feel about new tools? Who would resist, and who would champion it?', 'textarea'),
    ],
  },
  {
    id: 'training',
    title: 'H. The people who will use it',
    questions: [
      q('h_count', 'How many staff will use the new system, and in what roles?'),
      q('h_comfort', 'How comfortable are they with software?', 'select', { options: ['Low', 'Medium', 'High', 'It varies a lot'] }),
      q('h_languages', 'Which languages should the training and playbooks be in?'),
      q('h_format', 'Which training format do you prefer?', 'select', { options: ['A half-day workshop', 'Short sessions', 'Recorded guides', 'No preference'] }),
    ],
  },
  {
    id: 'practical',
    title: 'I. Practical',
    questions: [
      q('i_access', 'Can we get a test environment or read-only access to your main systems?', 'select', { options: ['Yes', 'Possibly, we need to check', 'No', 'Not sure'] }),
      q('i_approver', 'Who can approve giving us access, and how long does that usually take?'),
      q('i_procurement', 'Does your company need a purchase order, a vendor registration, or a particular invoicing process?'),
    ],
  },
];

export const AUDIT_QUESTIONS: Question[] = AUDIT_SECTIONS.flatMap((s) => s.questions);
export const AUDIT_FIELD_IDS: ReadonlySet<string> = new Set(AUDIT_QUESTIONS.map((x) => x.id));

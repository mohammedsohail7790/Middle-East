import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: vi.fn() } }));

import { renderReviewPage } from '../../../apps/gateway/src/services/audit/audit-review.controller.js';
import { assembleReport } from '../../../apps/gateway/src/services/audit/audit-report.js';

const raw = {
  assessment: { complexity: 'medium', volume: 'low', dataFormat: 'structured', systems: 'cloud', humanApproval: false, budgetMaxAed: null },
  summary: 'Acme re-types the same job details into three tools, which costs the office hours each week and causes missed invoices.',
  findings: ['Three tools hold the same data.'],
  opportunities: [{ title: 'Capture each job once', problem: 'Typed three times.', solution: 'One entry feeds all three tools.', payoff: 'Less admin.' }],
  phaseDeliverables: [['Map'], ['Build'], ['Test']],
  considerations: ['Confirm CRM admin access.'],
  nextSteps: ['Agree the scope.'],
};
const built = assembleReport({ raw: raw as any, lang: 'en', company: 'Acme', contactName: 'Sam', now: new Date('2026-11-12') });
const row = (status: string, report: any = built.report): any => ({ id: 'ab12cd34', company: 'Acme', email: 'sam@acme.test', contact_name: 'Sam', currency: 'AED', lang: 'en', answers: {}, report, assessment: built.assessment, status, approved_at: null, paid_at: null, delivered_at: null });

describe('review page buttons', () => {
  it('offers a test copy while in review, next to approve', () => {
    const html = renderReviewPage(row('in_review'), 'tok');
    expect(html).toContain('value="testcopy"');
    expect(html).toContain('value="approve"');
    expect(html).not.toContain('value="retry"');
  });
  it('offers a test copy after delivery too', () => {
    expect(renderReviewPage(row('delivered'), 'tok')).toContain('value="testcopy"');
  });
  it('offers a retry only when delivery failed', () => {
    expect(renderReviewPage(row('delivery_failed'), 'tok')).toContain('value="retry"');
    expect(renderReviewPage(row('paid'), 'tok')).not.toContain('value="retry"');
    expect(renderReviewPage(row('approved'), 'tok')).not.toContain('value="retry"');
  });
  it('has no buttons at all when there is no draft', () => {
    expect(renderReviewPage(row('submitted', null), 'tok')).not.toContain('value="testcopy"');
  });
});

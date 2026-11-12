/**
 * What counts as an alert, and how it reads. Pure functions: a billing warning or an integration failure goes in, an alert (English and Arabic) comes out, or null when it is not
 * worth interrupting the owner for. Nothing here touches the database or sends anything, so every rule is tested on its own.
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertCandidate {
  kind: string;
  severity: AlertSeverity;
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  /** A dashboard path, never a full URL. */
  href: string;
  /** The same dedupe key never produces a second alert for the same business. */
  dedupeKey: string;
}

export interface BillingWarningInput {
  id?: string;
  warningType: string;
  message?: string;
  details?: Record<string, unknown> | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Billing warnings already exist in the database (minutes at 90% and 100%, trial limits). This turns the ones worth telling the owner about into alerts.
 * Trial counters at 40, 50 and 55 minutes are passed over on purpose: one note at 58 minutes and one when it runs out is enough.
 */
export function alertFromBillingWarning(w: BillingWarningInput): AlertCandidate | null {
  const d = (w.details ?? {}) as Record<string, unknown>;
  const key = `billing:${w.warningType}:${w.id ?? 'once'}`;
  const href = '/dashboard/billing';
  const used = num(d.minutesUsed);
  const included = num(d.includedMinutes);
  const pct = num(d.usagePercent);
  const english = w.message?.trim();

  switch (w.warningType) {
    case 'usage_90_percent':
      return {
        kind: w.warningType,
        severity: 'warning',
        title: 'Your minutes are almost used up',
        titleAr: 'دقائقك على وشك النفاد',
        body: english || 'You have used about 90% of the minutes in your plan this period. Extra minutes are charged as overage.',
        bodyAr:
          used !== null && included !== null
            ? `استهلكت ${used} من ${included} دقيقة (${pct ?? 90}%). ستُحتسب الدقائق الإضافية كرسوم تجاوز.`
            : 'استهلكت نحو 90% من دقائق باقتك في هذه الفترة. ستُحتسب الدقائق الإضافية كرسوم تجاوز.',
        href,
        dedupeKey: key,
      };
    case 'usage_100_percent':
      return {
        kind: w.warningType,
        severity: 'critical',
        title: 'You have used all your included minutes',
        titleAr: 'استهلكت كل دقائق باقتك',
        body: english || 'You have used all the minutes in your plan this period. Calls still work; extra minutes are charged as overage.',
        bodyAr: 'استهلكت كل دقائق باقتك في هذه الفترة. تستمر المكالمات بالعمل، وتُحتسب الدقائق الإضافية كرسوم تجاوز.',
        href,
        dedupeKey: key,
      };
    case 'trial_58_minutes':
      return {
        kind: w.warningType,
        severity: 'warning',
        title: 'Your free trial minutes are almost gone',
        titleAr: 'دقائق التجربة المجانية على وشك النفاد',
        body: english || 'Only a couple of minutes are left in your free trial. Choose a plan to keep your receptionist answering calls.',
        bodyAr: 'تبقّت دقائق قليلة في تجربتك المجانية. اختر باقة ليستمر موظف الاستقبال في الرد على المكالمات.',
        href,
        dedupeKey: key,
      };
    case 'trial_minutes_exhausted':
      return {
        kind: w.warningType,
        severity: 'critical',
        title: 'Your free trial minutes have run out',
        titleAr: 'انتهت دقائق التجربة المجانية',
        body: english || 'Your free trial minutes are used up, so your receptionist has stopped answering calls. Choose a plan to switch it back on.',
        bodyAr: 'استُهلكت دقائق تجربتك المجانية، لذلك توقف موظف الاستقبال عن الرد على المكالمات. اختر باقة لإعادة تشغيله.',
        href,
        dedupeKey: key,
      };
    case 'trial_expired':
      return {
        kind: w.warningType,
        severity: 'critical',
        title: 'Your free trial has ended',
        titleAr: 'انتهت تجربتك المجانية',
        body: english || 'Your free trial has ended, so your receptionist has stopped answering calls. Choose a plan to switch it back on.',
        bodyAr: 'انتهت تجربتك المجانية، لذلك توقف موظف الاستقبال عن الرد على المكالمات. اختر باقة لإعادة تشغيله.',
        href,
        dedupeKey: key,
      };
    default:
      return null;
  }
}

const providerName = (raw: string): string | null => {
  const clean = String(raw ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!clean || clean === 'multi' || clean === 'unknown') return null;
  return clean.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
};

/** A connected tool failed. One alert per tool per day, and never the raw error text, which can contain internal details. */
export function alertFromIntegrationFailure(provider: string, now: Date): AlertCandidate {
  const name = providerName(provider);
  const day = now.toISOString().slice(0, 10);
  const slug = String(provider ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'unknown';
  return {
    kind: 'integration_failed',
    severity: 'warning',
    title: name ? `${name} needs attention` : 'A connected tool needs attention',
    titleAr: name ? `${name} يحتاج إلى انتباهك` : 'إحدى الأدوات المرتبطة تحتاج إلى انتباهك',
    body: `${name ?? 'One of your connected tools'} could not complete an action. Open Integrations and check the connection; reconnect it if needed. Calls are still being answered.`,
    bodyAr: `${name ?? 'إحدى أدواتك المرتبطة'} لم تتمكن من إتمام إجراء. افتح صفحة التكاملات وتحقق من الاتصال، وأعد ربطها عند الحاجة. المكالمات ما زالت يُردّ عليها.`,
    href: '/dashboard/integrations',
    dedupeKey: `integration:${slug}:${day}`,
  };
}

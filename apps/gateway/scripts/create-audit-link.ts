/**
 * Makes the private links for a client of the paid audit.
 *
 *   AUDIT_LINK_SECRET=... npx tsx apps/gateway/scripts/create-audit-link.ts form2 --company "Smith & Co" --email jordan@smith.com [--days 30]
 *   AUDIT_LINK_SECRET=... npx tsx apps/gateway/scripts/create-audit-link.ts pay   --company "Smith & Co" --email jordan@smith.com --currency AED [--days 5]
 *
 * `form2` opens the audit questionnaire (send it after the NDA). `pay` opens the payment page (send it with the "audit ready" email; default 5 days, which is the payment window).
 * Use the same AUDIT_LINK_SECRET as the live gateway. Changing that secret cancels every link already sent.
 */
import { randomBytes } from 'node:crypto';
import { signLink, type LinkKind } from '../src/services/audit/signed-link.js';
import { AUDIT_CURRENCIES, isAuditCurrency } from '../src/services/audit/audit-pricing.js';

const args = process.argv.slice(2);
const kind = args[0] as LinkKind;
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args[i + 1]; };
const fail = (msg: string): never => { console.error(msg); process.exit(1); };

if (kind !== 'form2' && kind !== 'pay') fail('First argument must be form2 or pay.');
const secret = process.env.AUDIT_LINK_SECRET ?? fail('Set AUDIT_LINK_SECRET (the same value as on the live gateway).');
const company = opt('company') ?? fail('Missing --company.');
const email = opt('email') ?? fail('Missing --email.');
const days = Number(opt('days') ?? (kind === 'pay' ? 5 : 30));
if (!Number.isFinite(days) || days <= 0 || days > 90) fail('--days must be between 1 and 90.');
const cur = opt('currency')?.toUpperCase();
if (kind === 'pay' && !isAuditCurrency(cur)) fail(`Payment links need --currency, one of ${AUDIT_CURRENCIES.join(', ')}.`);

const x = Math.floor(Date.now() / 1000 + days * 86400);
const token = signLink({ k: kind, id: randomBytes(4).toString('hex'), company, email, x, ...(kind === 'pay' ? { cur } : {}) }, secret);
const site = process.env.PUBLIC_SITE_URL || 'https://hallaai.com';
console.log(`${site}${kind === 'pay' ? '/audit/pay' : '/audit'}?t=${token}`);
console.log(`Valid until ${new Date(x * 1000).toISOString().slice(0, 10)}.`);

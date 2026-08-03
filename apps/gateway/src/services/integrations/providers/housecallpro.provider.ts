import { logger } from '../../logger.js';
import { IntegrationPayload } from '../integration.service.js';

export interface HouseCallProConfig {
    apiKey: string;
    companyId: string;
}

/**
 * HouseCallPro Integration Provider
 * Docs: https://docs.housecallpro.com/
 *
 * Fixes:
 *  - parsePreferredTime was a stub returning undefined — now parses ISO, common date
 *    phrases, and relative expressions into ISO 8601 datetime.
 *  - Duplicate customer prevention via phone lookup before create.
 */
export class HouseCallProProvider {
    private baseUrl = 'https://api.housecallpro.com/v2';

    async sendLead(config: HouseCallProConfig, payload: IntegrationPayload): Promise<void> {
        const { lead } = payload;

        // Find or create customer (prevents duplicate records on repeat callers)
        const customerId = await this.findOrCreateCustomer(config, {
            firstName: this.parseFirstName(lead.name),
            lastName: this.parseLastName(lead.name),
            phoneNumber: lead.phone || '',
            email: lead.notes?.includes('@') ? lead.notes : undefined,
        });

        const scheduledStart = lead.preferred_time
            ? this.parsePreferredTime(lead.preferred_time)
            : undefined;

        await this.createJob(config, {
            customerId,
            description: `${lead.service || 'Service Request'}`,
            notes: [
                `Preferred Time: ${lead.preferred_time || 'ASAP'}`,
                `Notes: ${lead.notes || 'None'}`,
                `Source: Call IQ Voice AI`,
                `Call ID: ${payload.callId}`,
            ].join('\n'),
            scheduledStart,
        });

        logger.info('HouseCallPro lead delivered', {
            callId: payload.callId,
            customerId,
            service: lead.service,
            scheduledStart: scheduledStart ?? 'unscheduled',
        });
    }

    /**
     * Look up an existing customer by phone number before creating.
     */
    private async findOrCreateCustomer(
        config: HouseCallProConfig,
        customer: { firstName: string; lastName: string; phoneNumber: string; email?: string }
    ): Promise<string> {
        if (customer.phoneNumber) {
            const existingId = await this.findCustomerByPhone(config, customer.phoneNumber);
            if (existingId) {
                logger.info('HouseCallPro reusing existing customer', { customerId: existingId });
                return existingId;
            }
        }
        return this.createCustomer(config, customer);
    }

    private async findCustomerByPhone(config: HouseCallProConfig, phone: string): Promise<string | null> {
        const normalizedPhone = phone.replace(/[^\d+]/g, '');
        try {
            const response = await fetch(
                `${this.baseUrl}/customers?mobile_number=${encodeURIComponent(normalizedPhone)}&page_size=1`,
                {
                    headers: { Authorization: `Bearer ${config.apiKey}` },
                }
            );
            if (!response.ok) return null;
            const data = (await response.json()) as { customers?: Array<{ id: string }> };
            return data.customers?.[0]?.id ?? null;
        } catch {
            return null;
        }
    }

    private async createCustomer(
        config: HouseCallProConfig,
        customer: { firstName: string; lastName: string; phoneNumber: string; email?: string }
    ): Promise<string> {
        const response = await fetch(`${this.baseUrl}/customers`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                company_id: config.companyId,
                first_name: customer.firstName,
                last_name: customer.lastName,
                mobile_number: customer.phoneNumber,
                ...(customer.email ? { email: customer.email } : {}),
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`HouseCallPro customer creation failed (${response.status}): ${error}`);
        }

        const result = (await response.json()) as { customer: { id: string } };
        return result.customer.id;
    }

    private async createJob(
        config: HouseCallProConfig,
        job: { customerId: string; description: string; notes: string; scheduledStart?: string }
    ): Promise<string> {
        const response = await fetch(`${this.baseUrl}/jobs`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                company_id: config.companyId,
                customer_id: job.customerId,
                description: job.description,
                notes: job.notes,
                ...(job.scheduledStart ? { scheduled_start: job.scheduledStart } : {}),
                work_status: 'needs_scheduling',
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`HouseCallPro job creation failed (${response.status}): ${error}`);
        }

        const result = (await response.json()) as { job: { id: string } };
        return result.job.id;
    }

    /**
     * Parse a natural-language or ISO preferred time into an ISO 8601 datetime string.
     *
     * Handles:
     *  - Already-valid ISO strings (passthrough)
     *  - Common relative expressions: "tomorrow morning", "next Monday", "this Friday afternoon"
     *  - Partial dates: "Monday 10am", "June 15", "15th at 2pm"
     *  - Falls back to next business day 9am if the string cannot be parsed.
     */
    parsePreferredTime(time: string): string | undefined {
        if (!time || typeof time !== 'string') return undefined;
        const trimmed = time.trim();

        // 1. Already a valid ISO date
        const isoDate = new Date(trimmed);
        if (!Number.isNaN(isoDate.getTime()) && trimmed.match(/\d{4}-\d{2}-\d{2}/)) {
            return isoDate.toISOString();
        }

        const lower = trimmed.toLowerCase();
        const now = new Date();
        const result = new Date(now);

        // Helper: resolve time-of-day from phrase
        const resolveHour = (phrase: string): number => {
            if (/\b(\d{1,2})\s*am\b/i.test(phrase)) {
                const h = parseInt(phrase.match(/\b(\d{1,2})\s*am\b/i)![1], 10);
                return h === 12 ? 0 : h;
            }
            if (/\b(\d{1,2})\s*pm\b/i.test(phrase)) {
                const h = parseInt(phrase.match(/\b(\d{1,2})\s*pm\b/i)![1], 10);
                return h === 12 ? 12 : h + 12;
            }
            if (/morning/i.test(phrase)) return 9;
            if (/afternoon/i.test(phrase)) return 14;
            if (/evening/i.test(phrase)) return 17;
            return 9; // default 9am
        };

        const hour = resolveHour(lower);

        // 2. Tomorrow
        if (/\btomorrow\b/.test(lower)) {
            result.setDate(now.getDate() + 1);
            result.setHours(hour, 0, 0, 0);
            return result.toISOString();
        }

        // 3. Named day of week (next Monday, this Friday, on Wednesday …)
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        for (let i = 0; i < dayNames.length; i++) {
            if (lower.includes(dayNames[i])) {
                const targetDay = i;
                const currentDay = now.getDay();
                let daysAhead = targetDay - currentDay;
                if (daysAhead <= 0) daysAhead += 7;
                result.setDate(now.getDate() + daysAhead);
                result.setHours(hour, 0, 0, 0);
                return result.toISOString();
            }
        }

        // 4. Month + day (e.g. "June 15", "Jan 3rd")
        const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        for (let m = 0; m < monthNames.length; m++) {
            const shortName = monthNames[m].slice(0, 3);
            if (lower.includes(monthNames[m]) || lower.includes(shortName)) {
                const dayMatch = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
                if (dayMatch) {
                    const day = parseInt(dayMatch[1], 10);
                    const year = result.getMonth() > m ? now.getFullYear() + 1 : now.getFullYear();
                    result.setFullYear(year, m, day);
                    result.setHours(hour, 0, 0, 0);
                    if (result > now) return result.toISOString();
                }
            }
        }

        // 5. Ordinal day only (e.g. "the 15th at 2pm")
        const ordinalMatch = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/);
        if (ordinalMatch) {
            const day = parseInt(ordinalMatch[1], 10);
            result.setDate(day);
            result.setHours(hour, 0, 0, 0);
            // If that day is in the past this month, advance to next month
            if (result <= now) result.setMonth(result.getMonth() + 1);
            return result.toISOString();
        }

        // 6. ASAP / as soon as possible / first available — schedule next business day 9am
        if (/asap|as soon as|first available|earliest|urgent/i.test(lower)) {
            const nextBusiness = new Date(now);
            nextBusiness.setDate(now.getDate() + 1);
            // Skip to Monday if it lands on weekend
            if (nextBusiness.getDay() === 0) nextBusiness.setDate(nextBusiness.getDate() + 1);
            if (nextBusiness.getDay() === 6) nextBusiness.setDate(nextBusiness.getDate() + 2);
            nextBusiness.setHours(9, 0, 0, 0);
            return nextBusiness.toISOString();
        }

        // Could not parse — return undefined so the job is created unscheduled
        logger.info('HouseCallPro: preferred_time could not be parsed, creating unscheduled job', { time });
        return undefined;
    }

    private parseFirstName(fullName?: string): string {
        if (!fullName) return 'Unknown';
        const parts = fullName.trim().split(/\s+/);
        return parts[0] || 'Unknown';
    }

    private parseLastName(fullName?: string): string {
        if (!fullName) return '';
        const parts = fullName.trim().split(/\s+/);
        return parts.slice(1).join(' ') || '';
    }
}

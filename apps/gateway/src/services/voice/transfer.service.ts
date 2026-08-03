import { logger } from '../logger.js';

export class TransferService {
    async transferCall(callSid: string, phoneNumber: string): Promise<void> {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (!accountSid || !authToken) {
            throw new Error('Twilio credentials missing');
        }

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>${phoneNumber}</Dial>
</Response>`;

        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                Twiml: twiml,
            }).toString(),
        });
        if (!response.ok) {
            const body = await response.text();
            logger.error('Twilio transfer failed', { callSid, status: response.status, body });
            throw new Error(`Twilio transfer failed (${response.status})`);
        }
    }

    /** Ends a live call via the Twilio REST API — used once the AI has said its goodbye. */
    async endCall(callSid: string): Promise<void> {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (!accountSid || !authToken) {
            throw new Error('Twilio credentials missing');
        }

        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ Status: 'completed' }).toString(),
        });
        if (!response.ok) {
            const body = await response.text();
            logger.error('Twilio end-call failed', { callSid, status: response.status, body });
            throw new Error(`Twilio end-call failed (${response.status})`);
        }
    }
}

export const transferService = new TransferService();


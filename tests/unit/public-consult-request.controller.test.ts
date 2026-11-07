import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

let server: Server;
let base: string;

async function start(leadEmails: string | undefined) {
  vi.resetModules();
  send.mockReset();
  send.mockResolvedValue({ id: 'x' });
  process.env.RESEND_API_KEY = 'test-key';
  if (leadEmails === undefined) delete process.env.CONSULT_LEAD_EMAIL;
  else process.env.CONSULT_LEAD_EMAIL = leadEmails;
  const { createPublicConsultRequestRouter } = await import('../../apps/gateway/src/services/leads/public-consult-request.controller.js');
  const app = express();
  app.use(express.json());
  app.use('/consult', createPublicConsultRequestRouter());
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/consult`;
}

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const post = (body: unknown) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const request = { name: 'Aisha Khan', email: 'aisha@example.com', business: 'Khan Trading', priority: 'Operations Automation', notes: 'We retype every order by hand.' };

describe('POST /public/consult-request recipients', () => {
  it('sends to every address in CONSULT_LEAD_EMAIL as a list, not one piece of text', async () => {
    await start('hello@example.com, hk@example.com ,owner@example.com');
    const res = await post(request);
    expect(res.status).toBe(200);
    expect(send.mock.calls[0][0].to).toEqual(['hello@example.com', 'hk@example.com', 'owner@example.com']);
  });

  it('uses hello@hallaai.com when nothing is set', async () => {
    await start(undefined);
    await post(request);
    expect(send.mock.calls[0][0].to).toEqual(['hello@hallaai.com']);
  });

  it('treats the contact page the same way', async () => {
    await start('a@example.com,b@example.com');
    await post({ name: 'Aisha Khan', email: 'aisha@example.com', priority: 'General enquiry', notes: 'Hello' });
    expect(send.mock.calls[0][0].to).toEqual(['a@example.com', 'b@example.com']);
    expect(send.mock.calls[0][0].subject).toContain('New Contact Message');
  });
});

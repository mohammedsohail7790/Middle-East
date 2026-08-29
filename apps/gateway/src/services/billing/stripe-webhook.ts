import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { billingService } from './billing.service.js';
import { logger } from '../logger.js';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-08-26.dahlia' })
  : null;

/** Mounted with express.raw() before global JSON parser */
export async function handleStripeBillingWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    res.status(400).json({ success: false, error: 'Webhook secret not configured' });
    return;
  }
  if (!stripe) {
    res.status(503).json({ success: false, error: 'Billing not configured' });
    return;
  }
  if (!sig) {
    res.status(400).json({ success: false, error: 'Missing stripe-signature header' });
    return;
  }

  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).json({ success: false, error: 'Webhook requires raw request body' });
    return;
  }

  try {
    const event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    await billingService.handleWebhook(event);
    logger.info('Stripe webhook processed', { type: event.type });
    res.json({ received: true });
  } catch (err) {
    logger.error('Stripe webhook verification failed', { error: String(err) });
    res.status(400).json({ success: false, error: 'Webhook signature verification failed' });
  }
}

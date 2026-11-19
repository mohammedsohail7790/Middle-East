import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { billingService } from './billing.service.js';
import { logger } from '../logger.js';
import { noteStripeWebhookFailureForTeam } from '../ops-alerts/team-alert.js';

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

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    logger.error('Stripe webhook verification failed', { error: String(err) });
    res.status(400).json({ success: false, error: 'Webhook signature verification failed' });
    return;
  }

  try {
    await billingService.handleWebhook(event);
    logger.info('Stripe webhook processed', { type: event.type });
    res.json({ received: true });
  } catch (err) {
    // The signature was fine, so this is our own failure. Same answer as before (a 400 makes Stripe retry), but the team is told and the log says what really happened.
    logger.error('Stripe webhook processing failed', { type: event.type, eventId: event.id, error: String(err) });
    noteStripeWebhookFailureForTeam(event.type, event.id, err);
    res.status(400).json({ success: false, error: 'Webhook processing failed' });
  }
}

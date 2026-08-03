# 04 — SUBSCRIPTION AND BILLING

## Plan Definitions

### Centralized Config: `apps/gateway/src/config/plan-config.ts`

| Feature | Essential ($39/mo) | Professional ($149/mo) | Enterprise ($499/mo) | Trial (Free) |
|---------|-------------------|----------------------|---------------------|--------------|
| Minutes | 250 | 750 | 4,000 | 60 total |
| Overage | $0.20/min | $0.15/min | $0.10/min | N/A |
| Phone numbers | 1 | 3 | 20 | 3 |
| Languages | EN, ES | EN, ES, FR, HI | EN, ES, FR, AR, ZH, HI | EN, ES, FR, HI |
| Custom voice | ❌ | ✅ | ✅ | ✅ |
| CRM integrations | ❌ | ✅ | ✅ | ✅ |
| Advanced analytics | ❌ | ✅ | ✅ | ✅ |
| API access | ❌ | ❌ | ✅ | ❌ |
| HIPAA | ❌ | ❌ | ✅ | ❌ |
| Voice cloning | ❌ | ❌ | ✅ | ❌ |
| Multi-language switching | ❌ | ❌ | ✅ | ❌ |
| SLA | ❌ | ❌ | ✅ | ❌ |

## Stripe Integration

**File:** `apps/gateway/src/services/billing/billing.service.ts`

### Environment Variables
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_ESSENTIAL_PRICE_ID=price_...
STRIPE_ESSENTIAL_OVERAGE_ID=price_...
STRIPE_PROFESSIONAL_PRICE_ID=price_...
STRIPE_PROFESSIONAL_OVERAGE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...
STRIPE_ENTERPRISE_OVERAGE_ID=price_...
```

### Webhook Events Handled
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `charge.succeeded`
- `charge.failed`

### Webhook Endpoint
`POST /api/v1/billing/webhook` — Validates Stripe signature, processes event.

## Trial Logic

**File:** `apps/gateway/src/services/billing/trial.service.ts`

### Rules
- Duration: 14 days
- Minutes: 60 total (across all calls)
- Features: Unlocks Professional tier
- Expiry: Whichever comes first (time OR minutes)

### Enforcement
```typescript
if (totalMinutesUsed >= 60 || now > trialExpiresAt) {
  // subscriptionStatus = "trial_paused"
  // Calls blocked, dashboard accessible, upgrade prompts shown
}
```

### Warning System
- **45 minutes used (75%):** Warning notification
- **55 minutes used (92%):** Urgent warning
- **60 minutes / 14 days:** Trial blocked

## Usage Tracking

### Dual-Write Pattern
1. **Redis (fast path):** Increment counter on each call for real-time checks
2. **PostgreSQL (durable):** `minutes_accounting` table for billing accuracy

### Database Table: `minutes_accounting`
```sql
CREATE TABLE minutes_accounting (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    subscription_id uuid,
    call_sid text NOT NULL,
    duration_seconds integer NOT NULL,
    billed_minutes integer NOT NULL,  -- ceil(duration_seconds / 60)
    source text NOT NULL DEFAULT 'voice',
    is_trial boolean NOT NULL DEFAULT false,
    billing_period_start date NOT NULL,
    billing_period_end date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
```

## Overage Billing

When a tenant exceeds included minutes:
1. `billingService.calculateOverage(tenantId)` computes overage minutes
2. Overage charged at plan-specific rate
3. Grace buffer: 10 minutes before hard block (fail-open for active calls)

## Enforcement Middleware

### File: `apps/gateway/src/middleware/usage-enforcement.ts`

```typescript
export async function enforceCallAllowed(tenantId: string): Promise<EnforcementResult> {
  // 1. Check subscription exists
  // 2. If trialing → check trial limits
  // 3. If active → check usage allowance
  // Returns: { allowed: boolean, reason?: string, blockType?: string }
}
```

### File: `apps/gateway/src/middleware/plan-gating.ts`

Middleware functions:
- `requirePlan(feature)` — Generic feature gate
- `requireEnterprise()` — Enterprise-only
- `requireProfessionalOrHigher()` — Rank-based
- `requireCallMinutes()` — Usage-based
- `requireCrmAccess()` — CRM integration gate
- `requireCalendarSync()` — Calendar feature gate

## Billing API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/billing/plans` | List all plans |
| GET | `/api/v1/billing/subscription` | Get tenant subscription |
| POST | `/api/v1/billing/subscription` | Create subscription |
| PUT | `/api/v1/billing/subscription/plan` | Change plan |
| DELETE | `/api/v1/billing/subscription` | Cancel subscription |
| GET | `/api/v1/billing/usage` | Current usage + limits |
| POST | `/api/v1/billing/usage` | Track usage event |
| GET | `/api/v1/billing/overage` | Calculate overage |
| POST | `/api/v1/billing/feature-check` | Check feature access |
| GET | `/api/v1/billing/invoices` | List invoices |
| POST | `/api/v1/billing/create-payment-intent` | Stripe payment intent |
| POST | `/api/v1/billing/webhook` | Stripe webhook |
| GET | `/api/v1/billing/trial` | Trial status |
| GET | `/api/v1/billing/plan-config` | Plan config for tenant |
| GET | `/api/v1/billing/plan-definitions` | All plan definitions (public) |

## Database Tables

### `subscriptions`
```sql
- id, tenant_id, stripe_customer_id, stripe_subscription_id
- plan (essential/professional/enterprise)
- status (active/canceled/past_due/trialing/incomplete/unpaid)
- current_period_start, current_period_end
- cancel_at_period_end
- trial_started_at, trial_expires_at, trial_minutes_used
- included_minutes, overage_minutes, overage_charged
```

### `billing_warnings`
```sql
- id, tenant_id, warning_type, message, details
- acknowledged, acknowledged_at, created_at
```

### `minutes_accounting`
```sql
- id, tenant_id, subscription_id, call_sid
- duration_seconds, billed_minutes, source, is_trial
- billing_period_start, billing_period_end
```

# Chaos Engineering

Automated validation (no production side effects):

```bash
npx vitest run tests/chaos/continuity-validation.test.ts
npx vitest run tests/replay/idempotency-validation.test.ts
```

Gateway-local harness: `apps/gateway/tests/chaos/run-chaos-tests.ts`

## Scenarios (manual / staging)

| Scenario | Validate |
|----------|----------|
| WebSocket churn | Sessions reconnect without duplicate runtime state |
| Redis unavailable | Calls continue; events queue or skip safely |
| Consumer crash | DLQ receives failed messages; replay idempotent |
| Governance deny storm | Tools denied; audit buffer consistent |

## Invariants

- `CallRuntimeSession` remains authority
- Event publish never throws into call path
- AI tools always pass through governance
- Tenant isolation via JWT + RLS

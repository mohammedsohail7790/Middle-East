# ADR-001: Organization is the Tenant Boundary

## Status

Accepted — ORG-001

## Decision

```text
Organization == Tenant
```

Every domain object belongs to exactly one organization.

There is **no** separate `tenant` table in product language.
There is **no** `workspace` abstraction in v1.

### Persistence

| Product | Table |
|---------|--------|
| Organization | `public.organizations` |
| Membership / ownership | `public.organization_members` (`role = 'owner'` in ORG-001; widened in ORG-002) |

Call IQ bridge (compatibility):

```text
organizations.id = voice_tenants.id  (1:1)
```

Existing billing, phones, AI, and integrations continue to use `tenant_id` FKs that point at the same UUID.

### Ownership

- Organizations store `created_by` (audit), not a permanent sole `owner_id`.
- Ownership is modeled through membership: create is **transactional** — insert organization + insert `organization_members` with `role = 'owner'`, else rollback.
- Authorization derives from membership (`auth.uid()` in `organization_members`), not from `created_by`.
- ORG-001 uses only the `owner` role (`CHECK (role = 'owner')`); other roles arrive with ORG-002.

### Slug

- Generated from name at create time (`Acme Corporation` → `acme-corporation`).
- **Immutable** on rename (`PATCH` updates `name` / `description` only).
- Explicit slug change can be added later if product requires it.

### Authorization

```text
Request → Authenticated User → Organization Membership → Authorized? → Continue
```

Never authorize from the user alone.

## API (ORG-001)

```text
POST   /api/v1/organizations
GET    /api/v1/organizations
GET    /api/v1/organizations/:slug
PATCH  /api/v1/organizations/:id
```

Delete is deferred.

## Success flow

```text
Sign In → Create Organization → Creator = Owner member
  → Redirect to Organization Overview → Future requests scoped by organization_id
```

## Rejected alternatives

| Model | Why not |
|-------|---------|
| Separate `tenants` product table | Duplicates the boundary; `organizations` is enough |
| `owner_id` as sole ownership | Conflicts with membership roles |
| Workspace under organization | No customer need in v1 |

## Responsibility split

| Issue | Owns |
|-------|------|
| **ORG-001** | `organizations`, `organization_members`, transactional owner row, CRUD, membership auth |
| **ORG-002** | Invite / accept / role assignment / member management (populates additional rows) |

`organization_members` is tenancy, not collaboration. Invitations are out of scope for ORG-001.

## Follow-ons

- **ORG-002** — Invite member (adds members to the existing table)
- Do not introduce workspace/BU abstractions until a real customer requires them

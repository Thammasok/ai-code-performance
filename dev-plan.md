# Dev Plan — ai-usage-dashboard (Next.js)

> Synthesized by the Orchestrator from `docs/contracts/domain-ai-usage-dashboard.yaml`,
> `docs/contracts/domain-ai-usage-backend.yaml`, and `docs/build/build-order.yaml`.
> Feature: **AI Usage Dashboard** — Tier 2 domain, consumes ai-usage-backend's
> `get-usage-summary`, `update-governance-policy`, `get-audit-log` endpoints.
> Stack: **React + Vite** (SPA) · TypeScript 5.5 · Tailwind · React Router · skill=`frontend-engineer`.
>
> **Contract deviation (approved by user):** the contract specifies `framework: next.js`,
> but we build with **React + Vite** instead. Rationale: the dashboard owns no server-side
> data and needs no SSR/Server Components — it's a pure client-side API consumer, so a Vite
> SPA with static/edge deploy satisfies the contract's `deploy_target` and SLA cleanly.

## Principles carried from ADRs
- Dashboard owns **no server-side data** — pure API consumer. Only client-side state is
  `DashboardUserPreference` (filters/theme/layout) in browser localStorage.
- Result scoping is enforced **server-side by role** (RBAC + RLS). The UI must not assume
  it can widen scope; it renders whatever the backend returns for the caller's role.
- Summary calls use a **circuit breaker + cached last-known summary** with a staleness
  indicator on failure. Governance + audit-log views **fail visibly** (no silent retry).

## RBAC surface (ADR-005)
| Role | Usage Summary | Governance Policy | Audit Log |
|------|--------------|-------------------|-----------|
| developer | own data only | — | — |
| manager | team data | — | — |
| platform_admin | all data | ✅ edit | ✅ view |
| auditor | own data only | — | ✅ view |

---

## Tasks

### T-001 — Project scaffold
- status: done
- agent: frontend-engineer
- size: S
- depends_on: []
- description: >
    Scaffold a React + Vite SPA under `dashboard/`. TypeScript 5.5, Tailwind CSS,
    ESLint, React Router for client-side routing, and a component primitive layer
    (shadcn/ui or Radix). Set up base layout, theming (light/dark), and a
    `.env.example` with `VITE_BACKEND_URL`. Static build output (per contract
    deploy_target: static/edge).
- acceptance_criteria:
    - `dashboard/` builds with `npm run build` (Vite) and lints clean
    - Root layout + React Router render with Tailwind + theme toggle
    - `.env.example` documents `VITE_BACKEND_URL`
    - Pure SPA — no server-side rendering, no data-persisting backend routes

### T-002 — Typed API client
- status: done
- agent: frontend-engineer
- size: M
- depends_on: [T-001]
- description: >
    Build a typed client for the three backend endpoints. Model request/response
    shapes exactly from domain-ai-usage-backend.yaml:
    GET /v1/usage/summary (date_from, date_to, group_by, optional developer_id/team_id),
    PATCH /v1/governance/policy (company_domains, personal_account_policy, raw_retention_days),
    GET /v1/governance/audit-log (date_from, date_to). Attach JWT auth header.
    Implement a circuit breaker + localStorage last-known cache for the summary call
    with a staleness timestamp; governance/audit calls fail visibly (surface error).
    Map 401/403/422/429 to typed errors.
- acceptance_criteria:
    - Types match the contract's input/output_schema for all 3 endpoints
    - Summary failure returns cached data + staleness flag; no infinite retry
    - Governance/audit failures throw typed errors surfaced to caller
    - 403 (scope exceeds role) is distinguishable from 401 (auth)

### T-003 — Auth session + role context
- status: done
- agent: frontend-engineer
- size: M
- depends_on: [T-001]
- description: >
    Establish the logged-in user's session and role (developer/manager/platform_admin/
    auditor). Provide a React context exposing role + identity used to gate routes and
    nav. Since the backend derives authorization from the JWT, the UI reads role from the
    session/claims and hides/disables unauthorized actions (defense-in-depth only — server
    remains the authority). Use React Router route guards for gating.
- acceptance_criteria:
    - Role available app-wide via context/provider
    - React Router guards: governance edit only for platform_admin; audit view for
      platform_admin/auditor
    - Unauthenticated users are redirected to sign-in

### T-004 — Usage summary view
- status: done
- agent: frontend-engineer
- size: L
- depends_on: [T-002, T-003]
- description: >
    Usage & cost dashboard. Date-range filter and group_by selector (tool/model/
    developer/day). Render charts + a table from the summary results (group_key,
    tokens_input, tokens_output, cost_estimate_usd, call_count). Respect role scope
    returned by the server. Show staleness banner when served from cache. Persist
    filter selections to localStorage (DashboardUserPreference).
- acceptance_criteria:
    - Charts + table render summary results with correct aggregation labels
    - group_by and date range drive the API query and update the view
    - Cached/stale state shows a clear indicator
    - Selected filters persist across reloads via localStorage

### T-005 — Governance policy admin screen
- status: done
- agent: frontend-engineer
- size: M
- depends_on: [T-002, T-003]
- description: >
    platform_admin-only settings screen to edit Governance config: company_domains
    (list), personal_account_policy (flag_only | collect_full), raw_retention_days
    (1–365). Submit via PATCH /v1/governance/policy. Show updated_at/updated_by on
    success; on failure show a visible error (no auto-retry). Screen is hidden/blocked
    for non-admin roles.
- acceptance_criteria:
    - Form validates raw_retention_days range and enum values
    - Successful PATCH reflects updated_at/updated_by
    - 403 shows an authorization error; screen inaccessible to non-admins
    - No silent retry on failure

### T-006 — Audit log compliance view
- status: done
- agent: frontend-engineer
- size: S
- depends_on: [T-002, T-003]
- description: >
    Read-only compliance view for platform_admin and auditor. Date-range filter,
    table of entries (actor, action, occurred_at, before/after diff). Fails visibly
    on error.
- acceptance_criteria:
    - Entries render with actor/action/timestamp and before→after detail
    - Date range filters the query
    - View accessible only to platform_admin/auditor
    - Error state is visible, no silent retry

### T-007 — Role-based navigation + shell
- status: done
- agent: frontend-engineer
- size: S
- depends_on: [T-003]
- description: >
    App shell: navigation that shows only the routes permitted for the current role,
    user menu, theme toggle wiring, and empty/error/loading states shared across views.
- acceptance_criteria:
    - Nav items reflect role gating from T-003
    - Shared loading/error/empty components used by data views
    - Theme + layout preferences persist (DashboardUserPreference)

---

## Dependency graph
```
T-001 ──┬──► T-002 ──┬──► T-004
        │            ├──► T-005
        │            └──► T-006
        └──► T-003 ──┴──► (T-004/T-005/T-006 also need T-003)
                     └──► T-007
```
Critical path: **T-001 → T-002 → T-004**

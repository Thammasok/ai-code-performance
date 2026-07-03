/**
 * Request/response types for the ai-usage-backend REST API.
 *
 * These mirror the backend domain contract EXACTLY. Do not add fields the
 * server does not send, and keep enum members aligned with the contract.
 *
 * Endpoints modeled here:
 *   - GET   /v1/usage/summary
 *   - PATCH /v1/governance/policy
 *   - GET   /v1/governance/audit-log
 */

/** ISO-8601 date string, e.g. "2026-07-03". */
export type IsoDate = string;

/** ISO-8601 timestamp string, e.g. "2026-07-03T12:34:56Z". */
export type IsoTimestamp = string;

/* ---------------------------------------------------------------------------
 * GET /v1/usage/summary
 * ------------------------------------------------------------------------- */

/** Dimension to aggregate usage by. */
export type UsageGroupBy = 'tool' | 'model' | 'developer' | 'day';

/**
 * Query params for GET /v1/usage/summary.
 *
 * `developer_id` and `team_id` are honored server-side only when the caller's
 * role (manager/admin) permits the requested scope; otherwise they are ignored
 * or rejected with 403.
 */
export interface UsageSummaryQuery {
  /** Required. Inclusive lower bound (date). */
  date_from: IsoDate;
  /** Required. Inclusive upper bound (date). */
  date_to: IsoDate;
  /** Optional aggregation dimension. */
  group_by?: UsageGroupBy;
  /** Optional. UUID; ignored server-side unless manager/admin. */
  developer_id?: string;
  /** Optional team scope. */
  team_id?: string;
}

/** A single aggregated usage row. */
export interface UsageSummaryRow {
  group_key: string;
  tokens_input: number;
  tokens_output: number;
  cost_estimate_usd: number;
  call_count: number;
}

/** Response body of GET /v1/usage/summary. */
export interface UsageSummaryResponse {
  results: UsageSummaryRow[];
}

/**
 * Result of a resilient summary fetch. Discriminated on `stale`:
 *   - `stale: false` — fresh data from the network.
 *   - `stale: true`  — served from the last-known localStorage cache after a
 *                      network/circuit failure; `cachedAt` is when it was stored.
 */
export type SummaryResult =
  | { stale: false; data: UsageSummaryResponse; cachedAt: IsoTimestamp }
  | { stale: true; data: UsageSummaryResponse; cachedAt: IsoTimestamp };

/* ---------------------------------------------------------------------------
 * PATCH /v1/governance/policy
 * ------------------------------------------------------------------------- */

/** How usage from personal (non-company) accounts is handled. */
export type PersonalAccountPolicy = 'flag_only' | 'collect_full';

/**
 * Request body for PATCH /v1/governance/policy. All fields optional; only the
 * provided fields are updated.
 */
export interface GovernancePolicyUpdate {
  company_domains?: string[];
  personal_account_policy?: PersonalAccountPolicy;
  /** Integer in the range 1..365. */
  raw_retention_days?: number;
}

/** Response body of PATCH /v1/governance/policy (the effective policy). */
export interface GovernancePolicyResponse {
  updated_at: IsoTimestamp;
  updated_by: string;
  company_domains: string[];
  personal_account_policy: PersonalAccountPolicy;
  raw_retention_days: number;
}

/* ---------------------------------------------------------------------------
 * GET /v1/governance/audit-log
 * ------------------------------------------------------------------------- */

/** Query params for GET /v1/governance/audit-log. Both optional. */
export interface AuditLogQuery {
  date_from?: IsoDate;
  date_to?: IsoDate;
}

/** A single audit-log entry. `before`/`after` are opaque JSON snapshots. */
export interface AuditLogEntry {
  actor: string;
  action: string;
  occurred_at: IsoTimestamp;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/** Response body of GET /v1/governance/audit-log. */
export interface AuditLogResponse {
  entries: AuditLogEntry[];
}

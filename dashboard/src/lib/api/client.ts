/**
 * Typed client for the ai-usage-backend.
 *
 * Covers exactly three endpoints:
 *   - GET   /v1/usage/summary        (resilient: circuit breaker + stale cache)
 *   - PATCH /v1/governance/policy    (fails visibly)
 *   - GET   /v1/governance/audit-log (fails visibly)
 *
 * Auth: this client does NOT own sessions. A `getToken` getter is injected at
 * construction; the client attaches `Authorization: Bearer <token>` when a
 * token is available and otherwise lets the backend answer with 401.
 */

import { ApiError, apiErrorFromResponse } from './errors';
import { CircuitBreaker, type CircuitBreakerOptions } from './circuit-breaker';
import { readSummaryCache, writeSummaryCache } from './summary-cache';
import type {
  AuditLogQuery,
  AuditLogResponse,
  GovernancePolicyResponse,
  GovernancePolicyUpdate,
  SummaryResult,
  UsageSummaryQuery,
  UsageSummaryResponse,
} from './types';

export interface ApiClientConfig {
  /** API base URL, e.g. `import.meta.env.VITE_BACKEND_URL`. */
  baseUrl: string;
  /**
   * Returns the current JWT, or null when unauthenticated. Owned by the auth
   * layer (T-003); the client only reads it.
   */
  getToken: () => string | null;
  /** Optional custom fetch (e.g. for tests). Defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Optional tuning for the summary circuit breaker. */
  circuitBreaker?: CircuitBreakerOptions;
}

/** Query param values we know how to serialize. */
type QueryValue = string | number | boolean | undefined | null;

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null;
  private readonly fetchFn: typeof fetch;
  /** Circuit breaker guarding the summary endpoint only. */
  private readonly summaryBreaker: CircuitBreaker;

  constructor(config: ApiClientConfig) {
    // Trim a trailing slash so path joining is predictable.
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.getToken = config.getToken;
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.summaryBreaker = new CircuitBreaker(config.circuitBreaker);
  }

  /* -----------------------------------------------------------------------
   * GET /v1/usage/summary — resilient
   * ---------------------------------------------------------------------- */

  /**
   * Fetch aggregated usage. On network/server failure (or while the circuit is
   * open) returns the last-known cached result flagged `{ stale: true }`
   * instead of throwing — no retry loop.
   *
   * @throws ApiError only when the fetch fails AND there is no cached fallback,
   *         or on a 4xx that is not a transient/availability failure (auth,
   *         authorization, validation) which the caller must see.
   */
  async getUsageSummary(query: UsageSummaryQuery): Promise<SummaryResult> {
    // Fail fast to cache while the breaker is open — avoids hammering.
    if (!this.summaryBreaker.canAttempt()) {
      return this.summaryFallback(query, null);
    }

    let response: Response;
    try {
      response = await this.rawRequest('GET', '/v1/usage/summary', {
        query: query as unknown as Record<string, QueryValue>,
      });
    } catch (networkError) {
      // Transport failed — count it and fall back to cache.
      this.summaryBreaker.recordFailure();
      return this.summaryFallback(query, asApiError(networkError));
    }

    if (response.ok) {
      const data = (await parseJson(response)) as UsageSummaryResponse;
      this.summaryBreaker.recordSuccess();
      const cached = writeSummaryCache(query, data);
      return { stale: false, data, cachedAt: cached.cachedAt };
    }

    const error = await apiErrorFromResponse(response);

    // Client-side mistakes (auth / authorization / validation) are NOT
    // availability failures — surface them so the UI can react, and do not
    // trip the breaker or serve stale data over a real permissions problem.
    if (error.kind === 'auth' || error.kind === 'authorization' || error.kind === 'validation') {
      throw error;
    }

    // 429 / 5xx / other: treat as availability failure — trip breaker, cache.
    this.summaryBreaker.recordFailure();
    return this.summaryFallback(query, error);
  }

  /** Serve cached summary if present; otherwise re-throw the causing error. */
  private summaryFallback(query: UsageSummaryQuery, cause: ApiError | null): SummaryResult {
    const cached = readSummaryCache(query);
    if (cached) {
      return { stale: true, data: cached.data, cachedAt: cached.cachedAt };
    }
    throw (
      cause ??
      new ApiError('network', 'Usage summary is unavailable and no cached data exists.', {
        status: null,
      })
    );
  }

  /* -----------------------------------------------------------------------
   * PATCH /v1/governance/policy — fails visibly
   * ---------------------------------------------------------------------- */

  /**
   * Update governance policy (platform_admin only). Throws a typed
   * {@link ApiError} on any failure — no retry, no fallback cache.
   */
  async updateGovernancePolicy(
    body: GovernancePolicyUpdate,
  ): Promise<GovernancePolicyResponse> {
    const response = await this.rawRequest('PATCH', '/v1/governance/policy', { body });
    if (!response.ok) throw await apiErrorFromResponse(response);
    return (await parseJson(response)) as GovernancePolicyResponse;
  }

  /* -----------------------------------------------------------------------
   * GET /v1/governance/audit-log — fails visibly
   * ---------------------------------------------------------------------- */

  /**
   * Retrieve the governance audit log (platform_admin/auditor). Throws a typed
   * {@link ApiError} on any failure — no retry, no fallback cache.
   */
  async getGovernanceAuditLog(query: AuditLogQuery = {}): Promise<AuditLogResponse> {
    const response = await this.rawRequest('GET', '/v1/governance/audit-log', {
      query: query as unknown as Record<string, QueryValue>,
    });
    if (!response.ok) throw await apiErrorFromResponse(response);
    return (await parseJson(response)) as AuditLogResponse;
  }

  /* -----------------------------------------------------------------------
   * Internals
   * ---------------------------------------------------------------------- */

  /**
   * Perform a single HTTP request. Never retries. Wraps transport errors in an
   * {@link ApiError} of kind 'network' so callers only ever see ApiError.
   */
  private async rawRequest(
    method: 'GET' | 'PATCH',
    path: string,
    options: { query?: Record<string, QueryValue>; body?: unknown } = {},
  ): Promise<Response> {
    const url = this.buildUrl(path, options.query);
    const headers = new Headers({ Accept: 'application/json' });

    const token = this.getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let payload: string | undefined;
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
      payload = JSON.stringify(options.body);
    }

    try {
      return await this.fetchFn(url, { method, headers, body: payload });
    } catch (cause) {
      throw new ApiError('network', 'Network request failed.', { status: null, cause });
    }
  }

  private buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new ApiError('unknown', 'Failed to parse response body as JSON.', {
      status: response.status,
      cause,
    });
  }
}

function asApiError(value: unknown): ApiError {
  if (value instanceof ApiError) return value;
  const message = value instanceof Error ? value.message : 'Network request failed.';
  return new ApiError('network', message, { status: null, cause: value });
}

/* ---------------------------------------------------------------------------
 * Factory + shared default instance
 * ------------------------------------------------------------------------- */

/** Create a client instance. Prefer this in tests / when you have a token getter. */
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}

/**
 * A lazily-initialized default client wired to `VITE_BACKEND_URL`. The auth
 * layer (T-003) injects the token getter once via {@link setTokenGetter}; until
 * then the getter returns null and calls go out unauthenticated (backend 401).
 */
let tokenGetter: () => string | null = () => null;

/**
 * Register the token getter for the default client. Called by the auth layer.
 * Kept as a settable module function so the client never owns session state.
 */
export function setTokenGetter(getter: () => string | null): void {
  tokenGetter = getter;
}

let defaultClient: ApiClient | null = null;

/** The shared client instance, created on first use from env config. */
export function getApiClient(): ApiClient {
  if (!defaultClient) {
    defaultClient = new ApiClient({
      baseUrl: import.meta.env.VITE_BACKEND_URL,
      getToken: () => tokenGetter(),
    });
  }
  return defaultClient;
}

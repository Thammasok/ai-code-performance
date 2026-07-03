/**
 * Public surface of the ai-usage-backend API client.
 *
 * Usage:
 *   import { getApiClient, setTokenGetter } from '@/lib/api';
 *   setTokenGetter(() => authStore.getState().accessToken); // wired by T-003
 *   const summary = await getApiClient().getUsageSummary({ date_from, date_to });
 *
 * Or construct explicitly:
 *   const client = createApiClient({ baseUrl, getToken });
 */

export {
  ApiClient,
  createApiClient,
  getApiClient,
  setTokenGetter,
  type ApiClientConfig,
} from './client';

export {
  ApiError,
  isApiError,
  kindFromStatus,
  type ApiErrorKind,
} from './errors';

export {
  CircuitBreaker,
  type CircuitState,
  type CircuitBreakerOptions,
} from './circuit-breaker';

export {
  summaryCacheKey,
  readSummaryCache,
  writeSummaryCache,
  type CachedSummary,
} from './summary-cache';

export type {
  IsoDate,
  IsoTimestamp,
  UsageGroupBy,
  UsageSummaryQuery,
  UsageSummaryRow,
  UsageSummaryResponse,
  SummaryResult,
  PersonalAccountPolicy,
  GovernancePolicyUpdate,
  GovernancePolicyResponse,
  AuditLogQuery,
  AuditLogEntry,
  AuditLogResponse,
} from './types';

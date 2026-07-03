/**
 * localStorage-backed "last-known summary" cache.
 *
 * The summary endpoint is resilient: on failure it serves the most recent
 * successful response for the same query params, flagged stale. The cache key
 * incorporates the query params so different filters do not clobber each other.
 */

import type { UsageSummaryQuery, UsageSummaryResponse, IsoTimestamp } from './types';

const KEY_PREFIX = 'ai-usage:summary:';

export interface CachedSummary {
  data: UsageSummaryResponse;
  cachedAt: IsoTimestamp;
}

/**
 * Build a stable cache key from the query. Keys are stringified with sorted
 * fields so equivalent queries map to the same entry regardless of key order.
 */
export function summaryCacheKey(query: UsageSummaryQuery): string {
  const normalized: Record<string, string> = {};
  for (const key of Object.keys(query).sort()) {
    const value = (query as unknown as Record<string, unknown>)[key];
    if (value !== undefined && value !== null && value !== '') {
      normalized[key] = String(value);
    }
  }
  return KEY_PREFIX + encodeURIComponent(JSON.stringify(normalized));
}

/** SSR-safe accessor; returns null when storage is unavailable. */
function storage(): Storage | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      return globalThis.localStorage;
    }
  } catch {
    // Access can throw in privacy modes / sandboxed frames.
  }
  return null;
}

/** Read the cached summary for a query, or null if absent/corrupt. */
export function readSummaryCache(query: UsageSummaryQuery): CachedSummary | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(summaryCacheKey(query));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isCachedSummary(parsed)) return parsed;
  } catch {
    // Corrupt entry — drop it below.
  }
  store.removeItem(summaryCacheKey(query));
  return null;
}

/** Persist a fresh summary for a query. Best-effort; ignores quota errors. */
export function writeSummaryCache(
  query: UsageSummaryQuery,
  data: UsageSummaryResponse,
): CachedSummary {
  const entry: CachedSummary = { data, cachedAt: new Date().toISOString() };
  const store = storage();
  if (store) {
    try {
      store.setItem(summaryCacheKey(query), JSON.stringify(entry));
    } catch {
      // Storage full or unavailable — cache is best-effort.
    }
  }
  return entry;
}

function isCachedSummary(value: unknown): value is CachedSummary {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const data = record.data as Record<string, unknown> | undefined;
  return (
    typeof record.cachedAt === 'string' &&
    !!data &&
    typeof data === 'object' &&
    Array.isArray((data as { results?: unknown }).results)
  );
}

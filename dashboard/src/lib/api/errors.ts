/**
 * Typed error model for the API client.
 *
 * HTTP failures are mapped into a discriminated `ApiError` whose `kind` field
 * distinguishes the cases the UI needs to react to differently:
 *   - 401 -> 'auth'          (token missing/expired/invalid — re-authenticate)
 *   - 403 -> 'authorization' (authenticated, but scope/role insufficient)
 *   - 422 -> 'validation'    (bad request payload/params)
 *   - 429 -> 'rate_limit'    (throttled; `retryAfterSeconds` when provided)
 *   - fetch threw -> 'network'
 *   - anything else -> 'unknown'
 */

export type ApiErrorKind =
  | 'auth'
  | 'authorization'
  | 'validation'
  | 'rate_limit'
  | 'network'
  | 'unknown';

/**
 * Error thrown (or returned) for failed API calls. `kind` is a literal
 * discriminant so callers can switch exhaustively.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status, or null when the request never got a response (network). */
  readonly status: number | null;
  /** Parsed response body, if any (usually a JSON error envelope). */
  readonly body: unknown;
  /** Seconds to wait before retrying, parsed from `Retry-After` on 429. */
  readonly retryAfterSeconds: number | null;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: {
      status?: number | null;
      body?: unknown;
      retryAfterSeconds?: number | null;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.body = options.body ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    // Restore prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/** Narrowing helper for unknown catch values. */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Map an HTTP status code to its {@link ApiErrorKind}. */
export function kindFromStatus(status: number): ApiErrorKind {
  switch (status) {
    case 401:
      return 'auth';
    case 403:
      return 'authorization';
    case 422:
      return 'validation';
    case 429:
      return 'rate_limit';
    default:
      return 'unknown';
  }
}

/**
 * Build an {@link ApiError} from a non-OK `Response`. Attempts to read a JSON
 * (or text) body for context; falls back gracefully if the body is unreadable.
 */
export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const kind = kindFromStatus(response.status);
  const body = await safeReadBody(response);
  const retryAfterSeconds =
    response.status === 429 ? parseRetryAfter(response.headers.get('retry-after')) : null;

  const message = extractMessage(body) ?? `${response.status} ${response.statusText}`.trim();

  return new ApiError(kind, message, {
    status: response.status,
    body,
    retryAfterSeconds,
  });
}

async function safeReadBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    const text = await response.text();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function extractMessage(body: unknown): string | null {
  if (typeof body === 'string' && body.length > 0) return body;
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail'] as const) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
  }
  return null;
}

function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return seconds;
  // HTTP-date form.
  const date = Date.parse(headerValue);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.round((date - Date.now()) / 1000));
  }
  return null;
}

/**
 * Minimal three-state circuit breaker.
 *
 * States:
 *   - closed:    requests flow normally; failures are counted.
 *   - open:      requests are short-circuited (fail fast) until `openUntil`.
 *   - half-open: after cooldown, a single trial request is allowed; success
 *                closes the breaker, failure re-opens it.
 *
 * This exists so the summary endpoint stops hammering a failing backend and
 * instead falls back to cache without an infinite retry loop.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Consecutive failures before the circuit opens. */
  failureThreshold?: number;
  /** How long the circuit stays open before allowing a trial, in ms. */
  openDurationMs?: number;
  /** Injectable clock for testing. */
  now?: () => number;
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly openDurationMs: number;
  private readonly now: () => number;

  private failureCount = 0;
  private openUntil = 0;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.openDurationMs = options.openDurationMs ?? 30_000;
    this.now = options.now ?? (() => Date.now());
  }

  /** Current state, computed lazily (open auto-transitions to half-open). */
  get state(): CircuitState {
    if (this.failureCount < this.failureThreshold) return 'closed';
    return this.now() >= this.openUntil ? 'half-open' : 'open';
  }

  /**
   * Whether a request may be attempted right now. `false` only while fully
   * open (cooldown not yet elapsed).
   */
  canAttempt(): boolean {
    return this.state !== 'open';
  }

  /** Record a successful call; resets the breaker to closed. */
  recordSuccess(): void {
    this.failureCount = 0;
    this.openUntil = 0;
  }

  /** Record a failed call; opens the breaker once the threshold is reached. */
  recordFailure(): void {
    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold) {
      this.openUntil = this.now() + this.openDurationMs;
    }
  }
}

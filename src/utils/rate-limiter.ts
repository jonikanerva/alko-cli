/**
 * Simple rate limiter for controlling request frequency
 */
export class RateLimiter {
  private lastRequestTime = 0;
  private readonly minIntervalMs: number;

  constructor(minIntervalMs: number) {
    this.minIntervalMs = minIntervalMs;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - timeSinceLastRequest;
      await this.sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  async throttleWithJitter(maxJitterMs = 1000): Promise<void> {
    await this.throttle();
    const jitter = Math.random() * maxJitterMs;
    await this.sleep(jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Exponential backoff calculator
 */
export class ExponentialBackoff {
  private attempt = 0;
  private readonly baseMs: number;
  private readonly maxMs: number;
  private readonly factor: number;

  constructor(options: { baseMs?: number; maxMs?: number; factor?: number } = {}) {
    this.baseMs = options.baseMs || 2000;
    this.maxMs = options.maxMs || 60000;
    this.factor = options.factor || 2;
  }

  /**
   * Number of consecutive failures accumulated since the last {@link reset}.
   * Callers use this to decide when to tear down their session / escalate.
   */
  get attempts(): number {
    return this.attempt;
  }

  getNextDelay(): number {
    const delay = Math.min(this.baseMs * Math.pow(this.factor, this.attempt), this.maxMs);
    this.attempt++;
    return delay;
  }

  reset(): void {
    this.attempt = 0;
  }

  async wait(): Promise<void> {
    const delay = this.getNextDelay();
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export function createAlkoRateLimiter(): RateLimiter {
  return new RateLimiter(2000);
}

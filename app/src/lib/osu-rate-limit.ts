import { AsyncLocalStorage } from "node:async_hooks";

// osu! allows 1200 API requests a minute per token, and 10 replay downloads a minute on top of
// that (osu-web config/osu.php, api.throttle). Every osu! API call goes through these limiters,
// so the score feed, people opening scores, and background speedrun downloads share one budget.
const WINDOW_MS = 60 * 1000;
const API_LIMIT = 1000;
const DOWNLOAD_LIMIT = 9;
// Background work only gets part of each budget, so feed polls and score views never queue
// behind it.
const API_BACKGROUND_LIMIT = 600;
const DOWNLOAD_BACKGROUND_LIMIT = 6;
const RATE_LIMITED_PAUSE_MS = WINDOW_MS;

export type OsuPriority = "feed" | "interactive" | "background";
const PRIORITIES: OsuPriority[] = ["feed", "interactive", "background"];

const priorityStorage = new AsyncLocalStorage<OsuPriority>();

// Runs fn with every osu! API call inside it at the given priority. Calls default to interactive.
export const withOsuPriority = <T>(priority: OsuPriority, fn: () => Promise<T>) =>
  priorityStorage.run(priority, fn);

type Waiter = { cost: number; resolve: () => void };

// A sliding window limiter. Staying under the limit in every 60s window also keeps osu!'s fixed
// one minute windows under it. Higher priorities always go first.
export class RateLimiter {
  private spent: { at: number; cost: number }[] = [];
  private waiting: Record<OsuPriority, Waiter[]> = { feed: [], interactive: [], background: [] };
  private pausedUntil = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private limit: number,
    private backgroundLimit: number,
  ) {}

  acquire(priority: OsuPriority, cost = 1) {
    return new Promise<void>((resolve) => {
      this.waiting[priority].push({ cost, resolve });
      this.drain();
    });
  }

  pause(ms: number) {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
    this.drain();
  }

  private drain() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (;;) {
      const now = Date.now();
      if (now < this.pausedUntil) return this.wakeIn(this.pausedUntil - now);
      const priority = PRIORITIES.find((p) => this.waiting[p].length > 0);
      if (!priority) return;
      const next = this.waiting[priority][0];
      this.spent = this.spent.filter((entry) => entry.at > now - WINDOW_MS);
      const used = this.spent.reduce((total, entry) => total + entry.cost, 0);
      const limit = priority === "background" ? this.backgroundLimit : this.limit;
      // A request costing more than the whole budget still runs once the window is empty.
      if (used > 0 && used + next.cost > limit) {
        return this.wakeIn(this.spent[0].at + WINDOW_MS - now);
      }
      this.waiting[priority].shift();
      this.spent.push({ at: now, cost: next.cost });
      next.resolve();
    }
  }

  private wakeIn(ms: number) {
    this.timer = setTimeout(() => this.drain(), Math.max(ms, 0) + 10);
  }
}

const apiLimiter = new RateLimiter(API_LIMIT, API_BACKGROUND_LIMIT);
const downloadLimiter = new RateLimiter(DOWNLOAD_LIMIT, DOWNLOAD_BACKGROUND_LIMIT);

const RATE_LIMIT_ERROR = "OsuRateLimitError";

export const isOsuRateLimitError = (error: unknown) =>
  error instanceof Error && error.name === RATE_LIMIT_ERROR;

// osu-api-extended hides status codes. osu! answers a throttled request with
// {"error": "Too Many Attempts."}, and the library refuses requests itself with "rate limited"
// when osu!'s remaining-requests header gets low.
const isRateLimited = (error: unknown) =>
  typeof error === "string" &&
  (error === "Too Many Attempts." || error === "rate limited" || error.startsWith("429"));

type OsuRequestOptions = {
  // What osu! charges for the request, e.g. one per user in a users lookup.
  cost?: number;
  // Replay downloads also count against the download limit.
  download?: boolean;
};

// Waits for room in the rate limits, then makes the request. On a rate-limit response every
// request of that kind pauses for a minute, and the call throws (see isOsuRateLimitError).
export async function osuRequest<T>(
  request: () => Promise<T>,
  { cost = 1, download = false }: OsuRequestOptions = {},
): Promise<T> {
  const priority = priorityStorage.getStore() ?? "interactive";
  // The download slot is the scarce one, so wait for it before taking an API slot.
  if (download) await downloadLimiter.acquire(priority);
  await apiLimiter.acquire(priority, cost);
  const result = await request();
  const error = (result as { error?: unknown } | null)?.error;
  if (isRateLimited(error)) {
    (download ? downloadLimiter : apiLimiter).pause(RATE_LIMITED_PAUSE_MS);
    const rateLimitError = new Error(`osu! API rate limited: ${String(error)}`);
    rateLimitError.name = RATE_LIMIT_ERROR;
    throw rateLimitError;
  }
  return result;
}

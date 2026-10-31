import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "./osu-rate-limit";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const track = (promise: Promise<void>) => {
    const state = { done: false };
    void promise.then(() => (state.done = true));
    return state;
  };

  it("holds requests past the limit until the window moves on", async () => {
    const limiter = new RateLimiter(2, 2);
    const first = track(limiter.acquire("feed"));
    const second = track(limiter.acquire("feed"));
    const third = track(limiter.acquire("feed"));
    await vi.advanceTimersByTimeAsync(0);
    expect([first.done, second.done, third.done]).toEqual([true, true, false]);

    await vi.advanceTimersByTimeAsync(59_000);
    expect(third.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(third.done).toBe(true);
  });

  it("keeps part of the budget out of reach of background requests", async () => {
    const limiter = new RateLimiter(3, 1);
    const background = [track(limiter.acquire("background")), track(limiter.acquire("background"))];
    const view = track(limiter.acquire("interactive"));
    await vi.advanceTimersByTimeAsync(0);
    expect(background.map((b) => b.done)).toEqual([true, false]);
    expect(view.done).toBe(true);
  });

  it("serves higher priorities first", async () => {
    const limiter = new RateLimiter(1, 1);
    await limiter.acquire("feed");
    const order: string[] = [];
    void limiter.acquire("background").then(() => order.push("background"));
    void limiter.acquire("interactive").then(() => order.push("interactive"));
    void limiter.acquire("feed").then(() => order.push("feed"));
    await vi.advanceTimersByTimeAsync(60_100);
    await vi.advanceTimersByTimeAsync(60_100);
    await vi.advanceTimersByTimeAsync(60_100);
    expect(order).toEqual(["feed", "interactive", "background"]);
  });

  it("counts request cost", async () => {
    const limiter = new RateLimiter(10, 10);
    const big = track(limiter.acquire("feed", 8));
    const next = track(limiter.acquire("feed", 3));
    await vi.advanceTimersByTimeAsync(0);
    expect([big.done, next.done]).toEqual([true, false]);
  });

  it("stops everything while paused", async () => {
    const limiter = new RateLimiter(10, 10);
    limiter.pause(60_000);
    const request = track(limiter.acquire("feed"));
    await vi.advanceTimersByTimeAsync(59_000);
    expect(request.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(request.done).toBe(true);
  });
});

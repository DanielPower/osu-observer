export type Mirror = {
  name: string;
  // Primary mirrors share load in rotation; fallbacks are only used while every primary is cooling down.
  tier: "primary" | "fallback";
  url: (beatmapSetId: number) => string;
  headers?: Record<string, string>;
};

export const BEATMAP_MIRRORS: Mirror[] = [
  {
    name: "osu.direct",
    tier: "primary",
    url: (id) => `https://osu.direct/api/d/${id}?noVideo=1`,
  },
  {
    name: "catboy.best",
    tier: "primary",
    url: (id) => `https://catboy.best/d/${id}n`,
  },
  {
    name: "nerinyan",
    tier: "primary",
    url: (id) => `https://api.nerinyan.moe/d/${id}?nv=1`,
    headers: { Accept: "application/x-osu-beatmap-archive" },
  },
  {
    name: "sayobot",
    tier: "fallback",
    url: (id) => `https://dl.sayobot.cn/beatmaps/download/novideo/${id}`,
  },
  {
    name: "beatconnect",
    tier: "fallback",
    url: (id) => `https://beatconnect.io/b/${id}/`,
  },
];

const USER_AGENT = "osu-observer (+https://github.com/DanielPower/osu-observer)";
const BASE_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 30 * 60_000;
const MIN_REQUEST_GAP_MS = 2_000;
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

type MirrorState = {
  cooldownUntil: number;
  consecutiveFailures: number;
  lastRequestAt: number;
};

export type MirrorPoolOptions = {
  mirrors?: Mirror[];
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

type Attempt<T> = { ok: true; result: T } | { ok: false; reason: string };

export function parseRetryAfter(header: string | null, now: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class MirrorPool {
  private readonly mirrors: Mirror[];
  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly states = new Map<string, MirrorState>();
  private readonly inFlight = new Map<number, Promise<unknown>>();
  private queue: Promise<unknown> = Promise.resolve();
  private nextPrimary = 0;

  constructor(options: MirrorPoolOptions = {}) {
    this.mirrors = options.mirrors ?? BEATMAP_MIRRORS;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        }));
    for (const mirror of this.mirrors) {
      this.states.set(mirror.name, { cooldownUntil: 0, consecutiveFailures: 0, lastRequestAt: 0 });
    }
  }

  // `accept` returns null when the archive is readable but not what we need (e.g. a stale
  // version of the set), which moves on to the next mirror without penalising this one.
  download<T>(
    beatmapSetId: number,
    accept: (archive: Uint8Array) => Promise<T | null>,
  ): Promise<T> {
    const existing = this.inFlight.get(beatmapSetId);
    if (existing) return existing as Promise<T>;

    const run = this.queue.then(() => this.downloadFromMirrors(beatmapSetId, accept));
    this.queue = run.catch(() => {});
    this.inFlight.set(beatmapSetId, run);
    void this.queue.then(() => {
      // oxlint-disable-next-line drizzle/enforce-delete-with-where
      this.inFlight.delete(beatmapSetId);
    });
    return run;
  }

  private candidates(): Mirror[] {
    const now = this.now();
    const available = (mirror: Mirror) => this.state(mirror).cooldownUntil <= now;
    const primaries = this.mirrors.filter((mirror) => mirror.tier === "primary");
    const start = primaries.length ? this.nextPrimary % primaries.length : 0;
    this.nextPrimary = start + 1;
    const rotated = [...primaries.slice(start), ...primaries.slice(0, start)];
    const fallbacks = this.mirrors.filter((mirror) => mirror.tier === "fallback");
    return [...rotated.filter(available), ...fallbacks.filter(available)];
  }

  private state(mirror: Mirror): MirrorState {
    return this.states.get(mirror.name)!;
  }

  private coolDown(mirror: Mirror, retryAfterMs: number | null) {
    const state = this.state(mirror);
    const backoff = Math.min(BASE_COOLDOWN_MS * 2 ** state.consecutiveFailures, MAX_COOLDOWN_MS);
    const cooldown = retryAfterMs ?? backoff;
    state.consecutiveFailures++;
    state.cooldownUntil = this.now() + cooldown;
    console.warn(`Beatmap mirror ${mirror.name} cooling down for ${Math.round(cooldown / 1000)}s`);
  }

  private async downloadFromMirrors<T>(
    beatmapSetId: number,
    accept: (archive: Uint8Array) => Promise<T | null>,
  ): Promise<T> {
    const candidates = this.candidates();
    if (!candidates.length) {
      const retryAt = Math.min(...[...this.states.values()].map((state) => state.cooldownUntil));
      throw new Error(
        `All beatmap mirrors are rate limited until ${new Date(retryAt).toISOString()}`,
      );
    }

    const failures: string[] = [];
    for (const mirror of candidates.slice(0, MAX_ATTEMPTS)) {
      // Mirrors are tried one at a time on purpose so a set is only downloaded once.
      // oxlint-disable-next-line no-await-in-loop
      const attempt = await this.tryMirror(mirror, beatmapSetId, accept);
      if (attempt.ok) {
        console.log(`Downloaded beatmap set ${beatmapSetId} from ${mirror.name}`);
        return attempt.result;
      }
      failures.push(`${mirror.name}: ${attempt.reason}`);
    }

    throw new Error(
      `Could not download beatmap set ${beatmapSetId} from any mirror (${failures.join("; ")})`,
    );
  }

  private async tryMirror<T>(
    mirror: Mirror,
    beatmapSetId: number,
    accept: (archive: Uint8Array) => Promise<T | null>,
  ): Promise<Attempt<T>> {
    const state = this.state(mirror);
    const wait = state.lastRequestAt + MIN_REQUEST_GAP_MS - this.now();
    if (wait > 0) await this.sleep(wait);
    state.lastRequestAt = this.now();

    let response: Response;
    try {
      response = await this.fetch(mirror.url(beatmapSetId), {
        headers: { "User-Agent": USER_AGENT, ...mirror.headers },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.coolDown(mirror, null);
      return { ok: false, reason: errorMessage(error) };
    }

    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429 || response.status >= 500) {
        this.coolDown(mirror, parseRetryAfter(response.headers.get("retry-after"), this.now()));
      }
      return { ok: false, reason: `HTTP ${response.status}` };
    }

    try {
      const result = await accept(new Uint8Array(await response.arrayBuffer()));
      if (result === null) {
        return { ok: false, reason: "archive does not contain the requested beatmap" };
      }
      state.consecutiveFailures = 0;
      return { ok: true, result };
    } catch (error) {
      return { ok: false, reason: errorMessage(error) };
    }
  }
}

export const beatmapMirrors = new MirrorPool();

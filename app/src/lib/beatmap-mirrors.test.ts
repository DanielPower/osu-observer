import { describe, expect, it } from "vitest";
import { type Mirror, MirrorPool, parseRetryAfter } from "./beatmap-mirrors";

const mirrors: Mirror[] = [
  { name: "a", tier: "primary", url: (id) => `https://a/${id}` },
  { name: "b", tier: "primary", url: (id) => `https://b/${id}` },
  { name: "fallback", tier: "fallback", url: (id) => `https://fallback/${id}` },
];

type Reply = { status: number; headers?: Record<string, string>; body?: string };

function setup(replies: Record<string, Reply[]>) {
  let time = 1_000_000;
  const requested: string[] = [];
  const pool = new MirrorPool({
    mirrors,
    now: () => time,
    sleep: (ms) => {
      time += ms;
      return Promise.resolve();
    },
    fetch: ((input: string) => {
      const host = new URL(input).host;
      requested.push(host);
      const reply = replies[host]?.shift() ?? { status: 200, body: "ok" };
      return Promise.resolve(
        new Response(reply.body ?? "", { status: reply.status, headers: reply.headers }),
      );
    }) as typeof fetch,
  });
  const accept = (archive: Uint8Array) => {
    const text = new TextDecoder().decode(archive);
    return Promise.resolve(text === "ok" ? text : null);
  };
  return {
    pool,
    requested,
    accept,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("MirrorPool", () => {
  it("rotates between primary mirrors", async () => {
    const { pool, requested, accept } = setup({});
    await pool.download(1, accept);
    await pool.download(2, accept);
    await pool.download(3, accept);
    expect(requested).toEqual(["a", "b", "a"]);
  });

  it("skips a rate limited mirror until Retry-After has passed", async () => {
    const { pool, requested, accept, advance } = setup({
      a: [{ status: 429, headers: { "Retry-After": "300" } }],
    });
    await expect(pool.download(1, accept)).resolves.toBe("ok");
    expect(requested).toEqual(["a", "b"]);

    await pool.download(2, accept);
    await pool.download(3, accept);
    expect(requested).toEqual(["a", "b", "b", "b"]);

    advance(300_000);
    await pool.download(4, accept);
    await pool.download(5, accept);
    expect(requested.slice(4)).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("uses fallbacks only while every primary is cooling down", async () => {
    const { pool, requested, accept } = setup({
      a: [{ status: 429 }],
      b: [{ status: 503 }],
    });
    await expect(pool.download(1, accept)).resolves.toBe("ok");
    expect(requested).toEqual(["a", "b", "fallback"]);
  });

  it("does not cool down a mirror that lacks the set or serves a stale version", async () => {
    const { pool, requested, accept } = setup({
      a: [{ status: 404 }, { status: 200, body: "stale" }],
    });
    await pool.download(1, accept);
    await pool.download(2, accept);
    await pool.download(3, accept);
    expect(requested).toEqual(["a", "b", "b", "a", "b"]);
  });

  it("throws when every mirror is cooling down", async () => {
    const { pool, accept } = setup({
      a: [{ status: 429 }],
      b: [{ status: 429 }],
      fallback: [{ status: 429 }],
    });
    await expect(pool.download(1, accept)).rejects.toThrow("any mirror");
    await expect(pool.download(2, accept)).rejects.toThrow("rate limited until");
  });

  it("shares one download between concurrent requests for the same set", async () => {
    const { pool, requested, accept } = setup({});
    const [first, second] = await Promise.all([pool.download(1, accept), pool.download(1, accept)]);
    expect(first).toBe("ok");
    expect(second).toBe("ok");
    expect(requested).toEqual(["a"]);
  });
});

describe("parseRetryAfter", () => {
  it("reads seconds and HTTP dates", () => {
    expect(parseRetryAfter("120", 0)).toBe(120_000);
    expect(parseRetryAfter(new Date(60_000).toUTCString(), 0)).toBe(60_000);
    expect(parseRetryAfter(null, 0)).toBeNull();
  });
});

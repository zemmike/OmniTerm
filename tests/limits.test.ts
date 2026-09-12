/**
 * Limits on the local API.
 *
 * The unit half drives the middleware directly with a fake clock and stub
 * req/res objects, which is where the boundary conditions live (exactly `max` is
 * allowed, the window resets, keys are independent, a slot is released even when
 * the client disconnects). The integration half boots the real built server with
 * deliberately tiny limits and proves both actually fire over HTTP — including
 * that a second command cannot start while the first is still running.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createConcurrencyLimit, createRateLimiter, positiveInt } from '../limits';
import { api, postJson, serverBuilt, startServer, type TestServer } from './helpers/server';

/* ------------------------------------------------------------ unit: rate limit */

function fakeReq(headers: Record<string, string> = {}): any {
  return {
    get: (name: string) => headers[name.toLowerCase()],
    query: {},
    ip: '127.0.0.1',
  };
}

function fakeRes(): any {
  const res: any = {
    headers: {} as Record<string, string>,
    statusCode: 200,
    body: undefined as unknown,
    setHeader: vi.fn((name: string, value: string) => {
      res.headers[name] = value;
    }),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload: unknown) => {
      res.body = payload;
      return res;
    }),
  };
  return res;
}

describe('createRateLimiter', () => {
  it('allows exactly `max` requests, then answers 429 with Retry-After', () => {
    const now = 1_000_000;
    const { middleware } = createRateLimiter({ windowMs: 10_000, max: 3, now: () => now });
    const req = fakeReq({ 'x-omniterm-token': 'tok' });

    for (let i = 0; i < 3; i += 1) {
      const res = fakeRes();
      const next = vi.fn();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(200);
    }

    const res = fakeRes();
    const next = vi.fn();
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('10');
    expect(String((res.body as { error: string }).error)).toMatch(/too many requests/i);
    expect((res.body as { retryAfterMs: number }).retryAfterMs).toBe(10_000);
  });

  it('forgets the window once it has elapsed', () => {
    let now = 0;
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1, now: () => now });
    const req = fakeReq({ 'x-omniterm-token': 'tok' });

    limiter.middleware(req, fakeRes(), vi.fn());
    expect(limiter.info.remaining('tok')).toBe(0);

    now += 999;
    const blocked = fakeRes();
    limiter.middleware(req, blocked, vi.fn());
    expect(blocked.statusCode).toBe(429);

    now += 1; // window boundary
    const allowed = fakeRes();
    const next = vi.fn();
    limiter.middleware(req, allowed, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(allowed.statusCode).toBe(200);
  });

  it('counts callers independently', () => {
    const { middleware } = createRateLimiter({ windowMs: 10_000, max: 1, now: () => 5 });
    const a = fakeReq({ 'x-omniterm-token': 'a' });
    const b = fakeReq({ 'x-omniterm-token': 'b' });

    middleware(a, fakeRes(), vi.fn());
    const second = fakeRes();
    const next = vi.fn();
    middleware(b, second, next);
    expect(next).toHaveBeenCalledTimes(1); // b is unaffected by a's usage
    expect(second.statusCode).toBe(200);

    const third = fakeRes();
    middleware(a, third, vi.fn());
    expect(third.statusCode).toBe(429);
  });

  it('prunes expired windows so the map cannot grow forever', () => {
    let now = 0;
    const limiter = createRateLimiter({ windowMs: 100, max: 5, now: () => now });
    for (let i = 0; i < 600; i += 1) {
      limiter.middleware(fakeReq({ 'x-omniterm-token': `caller-${i}` }), fakeRes(), vi.fn());
      now += 1; // every window expires behind us
    }
    // Nothing has leaked into a refusal for a brand-new caller.
    expect(limiter.info.remaining('caller-fresh')).toBe(5);
  });
});

/* --------------------------------------------------- unit: concurrency limit */

describe('createConcurrencyLimit', () => {
  function stubRes() {
    const handlers: Record<string, (() => void)[]> = {};
    return {
      headers: {} as Record<string, string>,
      statusCode: 200,
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json() {
        return this;
      },
      on(event: string, fn: () => void) {
        (handlers[event] ||= []).push(fn);
        return this;
      },
      emit(event: string) {
        for (const fn of handlers[event] || []) fn();
      },
    } as any;
  }

  it('rejects the request that would exceed the cap, and accepts the next once a slot frees', () => {
    const limit = createConcurrencyLimit(1, 'this API');
    const first = stubRes();
    const firstNext = vi.fn();
    limit({} as any, first, firstNext);
    expect(firstNext).toHaveBeenCalledTimes(1);

    const second = stubRes();
    const secondNext = vi.fn();
    limit({} as any, second, secondNext);
    expect(secondNext).not.toHaveBeenCalled();
    expect(second.statusCode).toBe(429);
    expect(second.headers['Retry-After']).toBe('1');

    first.emit('finish'); // the running command finished

    const third = stubRes();
    const thirdNext = vi.fn();
    limit({} as any, third, thirdNext);
    expect(thirdNext).toHaveBeenCalledTimes(1);
  });

  it('releases the slot when the client disconnects', () => {
    const limit = createConcurrencyLimit(1, 'this API');
    const first = stubRes();
    limit({} as any, first, vi.fn());

    first.emit('close'); // client went away mid-command

    const next = stubRes();
    const nextFn = vi.fn();
    limit({} as any, next, nextFn);
    expect(nextFn).toHaveBeenCalledTimes(1);
    expect(next.statusCode).toBe(200);
  });

  it('does not double-release when a response both finishes and closes', () => {
    const limit = createConcurrencyLimit(1, 'this API');
    const first = stubRes();
    limit({} as any, first, vi.fn());
    first.emit('finish');
    first.emit('close');

    // If the counter had gone negative, this second request would still pass
    // and the cap would stop meaning anything.
    const second = stubRes();
    limit({} as any, second, vi.fn());
    const third = stubRes();
    const thirdNext = vi.fn();
    limit({} as any, third, thirdNext);
    expect(thirdNext).not.toHaveBeenCalled();
    expect(third.statusCode).toBe(429);
  });
});

describe('positiveInt', () => {
  it('accepts real numbers and refuses nonsense', () => {
    expect(positiveInt('5', 1)).toBe(5);
    expect(positiveInt('2.9', 1)).toBe(2);
    expect(positiveInt(undefined, 7)).toBe(7);
    expect(positiveInt('0', 7)).toBe(7);
    expect(positiveInt('-3', 7)).toBe(7);
    expect(positiveInt('abc', 7)).toBe(7);
  });
});

/* ------------------------------------------------- integration: over HTTP */

describe.skipIf(!serverBuilt)('limits over HTTP', () => {
  let rl: TestServer; // tight rate limit
  let cc: TestServer; // tight concurrency cap

  beforeAll(async () => {
    [rl, cc] = await Promise.all([
      // Budget of 10, not 3: startServer() polls /api/health until the server is
      // ready, and that probe is a real request — it spends one credit before the
      // test's own calls begin. Asserting the invariant (a budget is enforced and
      // no 200 ever follows a 429 inside one window) is correct; asserting an
      // exact count would just encode the probe's timing.
      startServer({ OMNITERM_RATE_LIMIT_MAX: '10', OMNITERM_RATE_LIMIT_WINDOW_MS: '60000' }),
      startServer({ OMNITERM_RATE_LIMIT_MAX: '500', OMNITERM_MAX_CONCURRENCY: '1' }),
    ]);
  }, 120_000);

  afterAll(async () => {
    await rl?.stop();
    await cc?.stop();
  });

  it('enforces the request budget and never lets a 200 through after a 429', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 15; i += 1) {
      const res = await api(rl, '/api/health');
      codes.push(res.status);
    }

    const firstRefusal = codes.indexOf(429);
    expect(firstRefusal).toBeGreaterThan(0); // the budget exists and is reachable
    expect(codes.slice(firstRefusal).every((code) => code === 429)).toBe(true); // and it holds
    expect(codes.filter((code) => code === 200).length).toBeLessThanOrEqual(10); // never exceeds max

    const res = await api(rl, '/api/health');
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    const body = await res.json();
    expect(String(body.error)).toMatch(/too many requests/i);
  });

  it('refuses a second command while the first is still running', async () => {
    const slow = postJson(cc, '/api/terminal/execute', { command: 'sleep 1; echo done' });
    // Give the first request time to be accepted and start its shell.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const second = await postJson(cc, '/api/terminal/execute', { command: 'echo parallel' });

    expect(second.status).toBe(429);
    const body = await second.json();
    expect(String(body.error)).toMatch(/too many concurrent requests/i);

    const first = await slow;
    expect(first.status).toBe(200);
    expect((await first.json()).output).toContain('done');
  }, 60_000);

  it('lets work through again once the running command has finished', async () => {
    const res = await postJson(cc, '/api/terminal/execute', { command: 'echo after' });
    expect(res.status).toBe(200);
    expect((await res.json()).output).toContain('after');
  });
});

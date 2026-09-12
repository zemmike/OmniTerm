/**
 * Request limits for the local API.
 *
 * OmniTerm's API can run commands, so an unbounded request rate is an unbounded
 * number of shells: anything that can reach loopback with the token (a runaway
 * script, a compromised renderer, a loop with a typo) could otherwise spawn
 * processes until the machine gives up. Two independent limits guard that:
 *
 *  - a per-caller fixed-window rate limit, applied to every /api request, and
 *  - a concurrency cap for the endpoints that do real work (running a command,
 *    creating a snapshot), so adding more requests queues nothing and burns
 *    nothing.
 *
 * Both are deliberately dependency-free and both answer 429 with a JSON body the
 * client can act on. They are *not* a security boundary — the token is — they
 * stop accidents and self-inflicted denial of service.
 */
import type { NextFunction, Request, Response } from 'express';

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests allowed per window, per caller. */
  max: number;
  /** How a caller is identified. Defaults to the presented token, then the peer. */
  keyOf?: (req: Request) => string;
  /** Injectable clock, so tests do not have to sleep. */
  now?: () => number;
}

export interface RateLimitInfo {
  limit: number;
  windowMs: number;
  /** Calls still allowed in the current window. Exposed for tests. */
  remaining(key: string): number;
  /** Forgets every counter (used between tests). */
  reset(): void;
}

function defaultKey(req: Request): string {
  const token = String(req.get('x-omniterm-token') || req.query.token || '');
  return token || req.ip || 'unknown';
}

/** Drops expired windows so the map cannot grow without bound. */
function prune(hits: Map<string, { count: number; resetAt: number }>, now: number): void {
  for (const [key, entry] of hits) {
    if (entry.resetAt <= now) hits.delete(key);
  }
}

export function createRateLimiter(opts: RateLimitOptions): {
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  info: RateLimitInfo;
} {
  const { windowMs, max } = opts;
  const now = opts.now || Date.now;
  const keyOf = opts.keyOf || defaultKey;
  const hits = new Map<string, { count: number; resetAt: number }>();

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    const key = keyOf(req);
    const t = now();

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      if (hits.size > 512) prune(hits, t);
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      const retryAfterMs = Math.max(0, entry.resetAt - t);
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
      return res.status(429).json({
        error: `Too many requests: this API allows ${max} per ${Math.round(windowMs / 1000)}s. Retry in ${Math.ceil(retryAfterMs / 1000)}s.`,
        retryAfterMs,
      });
    }

    next();
  };

  return {
    middleware,
    info: {
      limit: max,
      windowMs,
      remaining: (key: string) => {
        const entry = hits.get(key);
        if (!entry || entry.resetAt <= now()) return max;
        return Math.max(0, max - entry.count);
      },
      reset: () => hits.clear(),
    },
  };
}

/**
 * Caps how many requests may be *in flight* at once. Used for routes that spawn
 * work rather than just reading state. The slot is released on finish *and* on
 * close, so a client that disconnects mid-command cannot leak it.
 */
export function createConcurrencyLimit(
  max: number,
  label: string,
): (req: Request, res: Response, next: NextFunction) => void {
  let inFlight = 0;
  return (req: Request, res: Response, next: NextFunction) => {
    if (inFlight >= max) {
      res.setHeader('Retry-After', '1');
      return res.status(429).json({
        error: `Too many concurrent requests: ${label} allows ${max} at a time. Wait for one to finish.`,
      });
    }
    inFlight += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      inFlight -= 1;
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
}

/** Reads a positive integer from the environment, falling back when unusable. */
export function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

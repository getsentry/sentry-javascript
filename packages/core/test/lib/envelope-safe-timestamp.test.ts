import { beforeEach, describe, expect, it } from 'vitest';
import { createCheckInEnvelope } from '../../src/checkin';
import { createEventEnvelope, createSessionEnvelope, createSpanEnvelope } from '../../src/envelope';
import { SentrySpan } from '../../src/tracing/sentrySpan';
import type { Event } from '../../src/types/event';
import { GLOBAL_OBJ } from '../../src/utils/worldwide';

/**
 * Envelope `sent_at` headers must derive their timestamp from `safeDateNow()` rather than
 * reading the ambient clock via a bare `new Date()`. Reading the clock directly is disallowed
 * in some restricted execution contexts (e.g. React Server Component prerendering); the SDK
 * lets host SDKs install a runner via the `__SENTRY_SAFE_RANDOM_ID_WRAPPER__` global symbol
 * (see `utils/randomSafeContext`) so that wrapped clock/random reads happen in a permitted
 * context. These tests assert the envelope creators route their timestamp through that runner.
 */

const SAFE_RANDOM_SYMBOL = Symbol.for('__SENTRY_SAFE_RANDOM_ID_WRAPPER__');

let inSafeContext = false;

// Install a runner like a host SDK would. Set at module scope so it is resolved by
// `withRandomSafeContext` before the first call.
(GLOBAL_OBJ as unknown as Record<symbol, unknown>)[SAFE_RANDOM_SYMBOL] = <T>(cb: () => T): T => {
  const previous = inSafeContext;
  inSafeContext = true;
  try {
    return cb();
  } finally {
    inSafeContext = previous;
  }
};

const RealDate = Date;

/**
 * Runs `fn` with a guarded clock that throws on a bare `new Date()` / `Date.now()` unless the
 * read happens inside the safe-context runner - mimicking a restricted prerender environment.
 */
function runWithGuardedClock<T>(fn: () => T): T {
  const GuardedDate = class extends RealDate {
    public constructor(...args: unknown[]) {
      if (args.length === 0 && !inSafeContext) {
        throw new Error('Read the ambient clock via `new Date()` outside the safe context');
      }
      super(...(args as [number | string | Date]));
    }

    public static now(): number {
      if (!inSafeContext) {
        throw new Error('Read the ambient clock via `Date.now()` outside the safe context');
      }
      return RealDate.now();
    }
  };

  (globalThis as { Date: DateConstructor }).Date = GuardedDate as unknown as DateConstructor;
  try {
    return fn();
  } finally {
    (globalThis as { Date: DateConstructor }).Date = RealDate;
  }
}

describe('envelope sent_at uses the safe time context', () => {
  beforeEach(() => {
    inSafeContext = false;
  });

  it('createEventEnvelope does not read the ambient clock directly', () => {
    const event: Event = { event_id: 'abc123', message: 'Test message' };
    expect(() => runWithGuardedClock(() => createEventEnvelope(event))).not.toThrow();
  });

  it('createSessionEnvelope does not read the ambient clock directly', () => {
    expect(() => runWithGuardedClock(() => createSessionEnvelope({ aggregates: [] }))).not.toThrow();
  });

  it('createSpanEnvelope does not read the ambient clock directly', () => {
    const span = new SentrySpan({ name: 'test-span', sampled: true });
    expect(() => runWithGuardedClock(() => createSpanEnvelope([span]))).not.toThrow();
  });

  it('createCheckInEnvelope does not read the ambient clock directly', () => {
    expect(() =>
      runWithGuardedClock(() => createCheckInEnvelope({ check_in_id: 'check-in', monitor_slug: 'slug', status: 'ok' })),
    ).not.toThrow();
  });
});

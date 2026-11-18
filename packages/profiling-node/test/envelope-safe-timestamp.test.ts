import { GLOBAL_OBJ } from '@sentry/core';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventEnvelopeHeaders } from '../src/utils';

const SAFE_RANDOM_SYMBOL = Symbol.for('__SENTRY_SAFE_RANDOM_ID_WRAPPER__');
const globals = GLOBAL_OBJ as unknown as Record<symbol, unknown>;
const originalRunner = globals[SAFE_RANDOM_SYMBOL];
const RealDate = Date;
let inSafeContext = false;

globals[SAFE_RANDOM_SYMBOL] = <T>(callback: () => T): T => {
  const previous = inSafeContext;
  inSafeContext = true;
  try {
    return callback();
  } finally {
    inSafeContext = previous;
  }
};

afterAll(() => {
  if (originalRunner === undefined) {
    Reflect.deleteProperty(globals, SAFE_RANDOM_SYMBOL);
  } else {
    globals[SAFE_RANDOM_SYMBOL] = originalRunner;
  }
});

describe('profile envelope timestamp', () => {
  it('reads the clock only inside the safe context', () => {
    const now = 1_700_000_000_000;
    const GuardedDate = class extends RealDate {
      public constructor(...args: unknown[]) {
        if (args.length === 0 && !inSafeContext) {
          throw new Error('Read new Date() outside the safe context');
        }
        super(...(args as [number | string | Date]));
      }

      public static now(): number {
        if (!inSafeContext) {
          throw new Error('Read Date.now() outside the safe context');
        }
        return now;
      }
    };

    (globalThis as { Date: DateConstructor }).Date = GuardedDate as DateConstructor;
    try {
      expect(createEventEnvelopeHeaders(undefined, undefined)).toMatchObject({
        event_id: expect.any(String),
        sent_at: new RealDate(now).toISOString(),
      });
      expect(inSafeContext).toBe(false);
    } finally {
      (globalThis as { Date: DateConstructor }).Date = RealDate;
    }
  });
});

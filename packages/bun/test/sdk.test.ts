import { describe, expect, test } from 'bun:test';

import { init } from '../src/index';

describe('Bun SDK', () => {
  const initOptions = {
    dsn: 'https://00000000000000000000000000000000@o000000.ingest.sentry.io/0000000',
    tracesSampleRate: 1,
  };

  test("calling init shouldn't fail", () => {
    expect(() => {
      init(initOptions);
    }).not.toThrow();
  });

  test('should return client from init', () => {
    expect(init(initOptions)).not.toBeUndefined();
  });
});

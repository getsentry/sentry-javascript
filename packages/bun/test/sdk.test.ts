import { expect, test } from 'bun:test';

import { init } from '../src/index';

test("calling init shouldn't fail", () => {
  init({
    dsn: 'https://00000000000000000000000000000000@o000000.ingest.sentry.io/0000000',
  });
  expect(true).toBe(true);
});

test('should return client from init', () => {
  expect(init({})).not.toBeUndefined();
});

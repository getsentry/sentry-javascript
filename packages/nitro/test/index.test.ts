// Dummy test to satisfy the test runner
import { describe, expect, test } from 'vitest';
import * as NitroServer from '../src';

describe('Nitro SDK', () => {
  // This is a place holder test at best to satisfy the test runner
  test('exports client and server SDKs', () => {
    expect(NitroServer).toBeDefined();
    expect(NitroServer.init).toBeDefined();
  });
});

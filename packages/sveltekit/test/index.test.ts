import { describe, expect, it } from 'vitest';
import * as SentryClient from '../src/client';
import * as SentryServer from '../src/server';

describe('SvelteKit SDK', () => {
  // This is a place holder test at best to satisfy the test runner
  it('exports client and server SDKs', () => {
    expect(SentryClient).toBeDefined();
    expect(SentryServer).toBeDefined();
    expect(SentryClient.init).toBeDefined();
    expect(SentryServer.init).toBeDefined();
  });
});

import { afterEach } from 'node:test';
import { describe, expect, it } from 'vitest';
import { supportsHistory } from '../../../src/utils/supports';

describe('supportsHistory', () => {
  const originalHistory = globalThis.history;

  afterEach(() => {
    globalThis.history = originalHistory;
  });

  it('returns true if history is available', () => {
    // @ts-expect-error - not setting all history properties
    globalThis.history = {
      pushState: () => {},
      replaceState: () => {},
    };
    expect(supportsHistory()).toBe(true);
  });

  it('returns false if history is not available', () => {
    // @ts-expect-error - deletion is okay in this case
    delete globalThis.history;
    expect(supportsHistory()).toBe(false);
  });

  it('returns false if history is undefined', () => {
    // @ts-expect-error - undefined is okay in this case
    globalThis.history = undefined;
    expect(supportsHistory()).toBe(false);
  });
});

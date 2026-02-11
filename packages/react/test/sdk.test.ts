import * as SentryBrowser from '@sentry/browser';
import { version } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { init } from '../src/sdk';

describe('init', () => {
  it('sets the React version (if available) in the global scope', () => {
    const setContextSpy = vi.spyOn(SentryBrowser, 'setContext');

    init({});

    expect(setContextSpy).toHaveBeenCalledTimes(1);
    expect(setContextSpy).toHaveBeenCalledWith('react', { version });
  });

  it('returns client from init', () => {
    expect(init({})).not.toBeUndefined();
  });
});

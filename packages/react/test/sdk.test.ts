import * as SentryBrowser from '@sentry/browser';
import { version } from 'react';
import { init } from '../src/sdk';

jest.mock('@sentry/browser', () => {
  return {
    __esModule: true,
    ...jest.requireActual('@sentry/browser'),
  };
});

describe('init', () => {
  it('sets the React version (if available) in the global scope', () => {
    const setContextSpy = jest.spyOn(SentryBrowser, 'setContext');

    init({});

    expect(setContextSpy).toHaveBeenCalledTimes(1);
    expect(setContextSpy).toHaveBeenCalledWith('react', { version });
  });

  it('returns client from init', () => {
    expect(init({})).not.toBeUndefined();
  });
});

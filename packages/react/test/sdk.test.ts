import * as SentryBrowser from '@sentry/browser';
import { version } from 'react';
import { init } from '../src/sdk';

describe('init', () => {
  it('sets the React version (if available) in the global scope', () => {
    const setContextSpy = jest.spyOn(SentryBrowser, 'setContext');

    init({});

    expect(setContextSpy).toHaveBeenCalledTimes(1);
    expect(setContextSpy).toHaveBeenCalledWith('react', { version });
  });
});

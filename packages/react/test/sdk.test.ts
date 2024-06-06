import * as SentryBrowser from '@sentry/browser';
import { version } from 'react';
import { init } from '../src/sdk';

describe('init', () => {
  it('sets the React version (if available) in the global scope', () => {
    const setContextSpy = jest.spyOn(SentryBrowser, 'setContext');

    init({});

    // In our case, the Angular version is 10 because that's the version we use for compilation
    // (and hence the dependency version of Angular core we installed (see package.json))
    expect(setContextSpy).toHaveBeenCalledTimes(1);
    expect(setContextSpy).toHaveBeenCalledWith('react', { version });
  });
});

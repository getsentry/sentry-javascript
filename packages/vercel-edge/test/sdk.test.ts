import * as SentryCore from '@sentry/core';
import { init } from '../src/sdk';

describe('init', () => {
  it('initializes and returns client', () => {
    const initSpy = jest.spyOn(SentryCore, 'initAndBind');

    expect(init({})).not.toBeUndefined();
    expect(initSpy).toHaveBeenCalledTimes(1);
  });
});

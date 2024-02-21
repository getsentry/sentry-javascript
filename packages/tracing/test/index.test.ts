import { getCurrentHub } from '@sentry/core';

import { Integrations } from '../src';

describe('index', () => {
  it('patches the global hub to add an implementation for `Hub.startTransaction` as a side effect', () => {
    // eslint-disable-next-line deprecation/deprecation
    const hub = getCurrentHub();
    // eslint-disable-next-line deprecation/deprecation
    const transaction = hub.startTransaction({ name: 'test', endTimestamp: 123 });
    expect(transaction).toBeDefined();
  });

  describe('Integrations', () => {
    it('is exported correctly', () => {
      Object.keys(Integrations).forEach(key => {
        expect((Integrations as any)[key].id).toStrictEqual(expect.any(String));
      });
    });
  });
});

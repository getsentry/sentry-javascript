import { getCurrentHub } from '@sentry/hub';

import { BrowserTracing, Integrations } from '../src';

describe('index', () => {
  describe('Integrations', () => {
    it('is exported correctly', () => {
      Object.keys(Integrations).forEach(key => {
        expect(Integrations[key as keyof typeof Integrations].id).toStrictEqual(expect.any(String));
      });
    });

    it('contains BrowserTracing', () => {
      expect(Integrations.BrowserTracing).toEqual(BrowserTracing);
    });
  });

  it('patches the global hub as a side effect', () => {
    const hub = getCurrentHub();
    const transaction = hub.startTransaction({ name: 'test', endTimestamp: 123 });
    expect(transaction).toBeDefined();
  });
});

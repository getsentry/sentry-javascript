import { getCurrentHub } from '@sentry/core';

import { BrowserTracing, Integrations } from '../src';

describe('index', () => {
  it('patches the global hub to add an implementation for `Hub.startTransaction` as a side effect', () => {
    const hub = getCurrentHub();
    const transaction = hub.startTransaction({ name: 'test', endTimestamp: 123 });
    expect(transaction).toBeDefined();
  });

  describe('Integrations', () => {
    it('is exported correctly', () => {
      Object.keys(Integrations).forEach(key => {
        // Skip BrowserTracing because it doesn't have a static id field.
        if (key === 'BrowserTracing') {
          return;
        }

        expect(Integrations[key as keyof Omit<typeof Integrations, 'BrowserTracing'>].id).toStrictEqual(
          expect.any(String),
        );
      });
    });

    it('contains BrowserTracing', () => {
      // eslint-disable-next-line deprecation/deprecation
      expect(Integrations.BrowserTracing).toEqual(BrowserTracing);
    });
  });
});

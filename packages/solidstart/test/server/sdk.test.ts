import type { EventProcessor } from '@sentry/core';
import { getGlobalScope, Scope, SDK_VERSION } from '@sentry/node';
import * as SentryNode from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init as solidStartInit } from '../../src/server';
import { lowQualityTransactionsFilter } from '../../src/server/utils';

const browserInit = vi.spyOn(SentryNode, 'init');

describe('Initialize Solid Start SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has the correct metadata', () => {
    const client = solidStartInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    const expectedMetadata = {
      _metadata: {
        sdk: {
          name: 'sentry.javascript.solidstart',
          packages: [
            { name: 'npm:@sentry/solidstart', version: SDK_VERSION },
            { name: 'npm:@sentry/node', version: SDK_VERSION },
          ],
          version: SDK_VERSION,
        },
      },
    };

    expect(client).not.toBeUndefined();
    expect(browserInit).toHaveBeenCalledTimes(1);
    expect(browserInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
  });

  describe('lowQualityTransactionsFilter', () => {
    const options = { debug: false };
    const filter = lowQualityTransactionsFilter(options);

    describe('filters out low quality transactions', () => {
      it.each(['GET /_build/some_asset.js', 'GET /_build/app.js', 'GET /_build/assets/logo.png'])(
        'filters out low quality transaction: (%s)',
        transaction => {
          const event = { type: 'transaction' as const, transaction };
          expect(filter(event, {})).toBeNull();
        },
      );
    });

    describe('keeps high quality transactions', () => {
      it.each(['GET /', 'POST /_server'])('does not filter out route transactions (%s)', transaction => {
        const event = { type: 'transaction' as const, transaction };
        expect(filter(event, {})).toEqual(event);
      });
    });

    it('does not filter non-transaction events', () => {
      const event = { type: 'error' as const, transaction: 'GET /_build/app.js' } as any;
      expect(filter(event, {})).toEqual(event);
    });

    it('handles events without transaction property', () => {
      const event = { type: 'transaction' as const };
      expect(filter(event, {})).toEqual(event);
    });
  });

  it('registers an event processor', () => {
    let passedEventProcessors: EventProcessor[] = [];
    const addEventProcessor = vi
      .spyOn(getGlobalScope(), 'addEventProcessor')
      .mockImplementation((eventProcessor: EventProcessor) => {
        passedEventProcessors = [...passedEventProcessors, eventProcessor];
        return new Scope();
      });

    solidStartInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    expect(addEventProcessor).toHaveBeenCalledTimes(1);
    expect(passedEventProcessors[0]?.id).toEqual('SolidStartLowQualityTransactionsFilter');
  });
});

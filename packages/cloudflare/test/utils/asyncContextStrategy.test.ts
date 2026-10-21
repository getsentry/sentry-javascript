import { getAsyncContextStrategy, getMainCarrier } from '@sentry/core';
import { setOpenTelemetryContextAsyncContextStrategy } from '@sentry/opentelemetry';
import { afterEach, describe, expect, it } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategyForWorker } from '../../src/utils/asyncContextStrategy';
import { resetSdk } from '../testUtils';

describe('setAsyncLocalStorageAsyncContextStrategyForWorker', () => {
  afterEach(() => {
    resetSdk();
  });

  it('installs the AsyncLocalStorage strategy', () => {
    setAsyncLocalStorageAsyncContextStrategyForWorker();

    const strategy = getAsyncContextStrategy(getMainCarrier());
    expect(strategy.getTracingChannelBinding).toBeDefined();
    expect(strategy.withActiveSpan).toBeUndefined();
  });

  it('keeps an installed OpenTelemetry strategy', () => {
    setOpenTelemetryContextAsyncContextStrategy();
    const openTelemetryStrategy = getAsyncContextStrategy(getMainCarrier());

    setAsyncLocalStorageAsyncContextStrategyForWorker();

    expect(getAsyncContextStrategy(getMainCarrier())).toBe(openTelemetryStrategy);
  });
});

import { getMainCarrier } from '@sentry/core';
import type * as EffectModule from 'effect';
import { Effect, Layer } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSentryErrorReporterLayer } from '../src/errorReporter';
import * as sentryServer from '../src/index.server';

// Effect v3 ships no `ErrorReporter` module, so its main entry has no such namespace.
vi.mock('effect', async importOriginal => {
  const actual = await importOriginal<typeof EffectModule>();
  return { ...actual, ErrorReporter: undefined };
});

describe('Sentry ErrorReporter without the Effect v4 ErrorReporter API', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('returns an empty layer', () => {
    expect(makeSentryErrorReporterLayer()).toBe(Layer.empty);
  });

  it('still builds the effectLayer', async () => {
    const result = await Effect.runPromise(
      Effect.succeed('ok').pipe(
        Effect.provide(
          sentryServer.effectLayer({
            dsn: 'https://username@domain/123',
            transport: () => ({
              send: vi.fn().mockResolvedValue({}),
              flush: vi.fn().mockResolvedValue(true),
            }),
          }),
        ),
      ),
    );

    expect(result).toBe('ok');
  });
});

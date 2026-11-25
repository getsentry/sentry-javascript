import { getMainCarrier } from '@sentry/core';
import { Effect, Layer } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Compat from '../src/compat';
import { makeSentryErrorReporterLayer } from '../src/errorReporter';
import * as Sentry from '../src/server/index';

// Effect v3 ships no `ErrorReporter` API.
vi.mock('../src/compat', async importOriginal => ({
  ...(await importOriginal<typeof Compat>()),
  isEffectV4: false,
}));

describe('Sentry ErrorReporter without the Effect v4 ErrorReporter API', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('returns an empty layer', () => {
    expect(makeSentryErrorReporterLayer()).toBe(Layer.empty);
  });

  it('still builds the Sentry layer', async () => {
    const result = await Effect.runPromise(
      Effect.succeed('ok').pipe(
        Effect.provide(
          Sentry.layer({
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

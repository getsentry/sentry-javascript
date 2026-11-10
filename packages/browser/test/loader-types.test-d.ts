import { expectTypeOf, it, describe } from 'vitest';
import type { Scope } from '@sentry/core';
import type { LoaderSentry } from '../src/loader-types';

describe('LoaderSentry', () => {
  it('exposes the APIs supported by the loader', () => {
    expectTypeOf<LoaderSentry>().toHaveProperty('init');
    expectTypeOf<LoaderSentry>().toHaveProperty('addBreadcrumb');
    expectTypeOf<LoaderSentry>().toHaveProperty('captureMessage');
    expectTypeOf<LoaderSentry>().toHaveProperty('captureException');
    expectTypeOf<LoaderSentry>().toHaveProperty('captureEvent');
    expectTypeOf<LoaderSentry>().toHaveProperty('withScope');
    expectTypeOf<LoaderSentry>().toHaveProperty('showReportDialog');
    expectTypeOf<LoaderSentry>().toHaveProperty('onLoad');
    expectTypeOf<LoaderSentry>().toHaveProperty('forceLoad');
  });

  it('does not expose unsupported APIs', () => {
    expectTypeOf<LoaderSentry>().not.toHaveProperty('addIntegration');
    expectTypeOf<LoaderSentry>().not.toHaveProperty('captureFeedback');
    expectTypeOf<LoaderSentry>().not.toHaveProperty('flush');
    expectTypeOf<LoaderSentry>().not.toHaveProperty('close');
  });

  it('uses void return types for queued methods', () => {
    expectTypeOf<LoaderSentry['init']>().returns.toBeVoid();
    expectTypeOf<LoaderSentry['addBreadcrumb']>().returns.toBeVoid();
    expectTypeOf<LoaderSentry['captureMessage']>().returns.toBeVoid();
    expectTypeOf<LoaderSentry['captureException']>().returns.toBeVoid();
    expectTypeOf<LoaderSentry['captureEvent']>().returns.toBeVoid();
    expectTypeOf<LoaderSentry['withScope']>().returns.toBeVoid();
    expectTypeOf<LoaderSentry['showReportDialog']>().returns.toBeVoid();
  });

  it('keeps the parameters of the SDK methods', () => {
    expectTypeOf<LoaderSentry['init']>().toBeCallableWith({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
    expectTypeOf<LoaderSentry['captureException']>().toBeCallableWith(new Error('test'), { tags: { foo: 'bar' } });
    expectTypeOf<LoaderSentry['captureMessage']>().toBeCallableWith('test', 'warning');
    expectTypeOf<LoaderSentry['onLoad']>().toBeCallableWith(() => {});
  });

  it('only exposes the callback overload of withScope', () => {
    expectTypeOf<LoaderSentry['withScope']>().toBeCallableWith(scope => {
      scope.setTag('foo', 'bar');
    });
    expectTypeOf<LoaderSentry['withScope']>().parameters.toEqualTypeOf<[callback: (scope: Scope) => void]>();
  });
});

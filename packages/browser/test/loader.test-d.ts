import { expectTypeOf, it, describe } from 'vitest';
import type { LoaderSentry } from '../src/loader';

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
});

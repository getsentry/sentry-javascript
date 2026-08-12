import type Route from '@ember/routing/route';
import { startSpan } from '@sentry/browser';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/browser', () => ({
  startSpan: vi.fn((_options: unknown, callback: () => unknown) => callback()),
}));
vi.mock('@sentry/core', () => ({
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'sentry.origin',
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE: 'sentry.source',
}));

describe('instrumentRoutePerformance', () => {
  it('wrapped Route hooks maintain the current context', async () => {
    const { instrumentRoutePerformance } = await import('../src/utils/instrumentRoutePerformance.ts');

    const beforeModel = vi.fn();
    const model = vi.fn();
    const afterModel = vi.fn();
    const setupController = vi.fn();

    class DummyRoute {
      public fullRouteName = 'dummy';

      public beforeModel(...args: unknown[]): void {
        beforeModel.apply(this, args);
      }

      public model(...args: unknown[]): void {
        model.apply(this, args);
      }

      public afterModel(...args: unknown[]): void {
        afterModel.apply(this, args);
      }

      public setupController(...args: unknown[]): void {
        setupController.apply(this, args);
      }
    }

    const InstrumentedDummyRoute = instrumentRoutePerformance(
      DummyRoute as unknown as new (...args: unknown[]) => Route,
    );

    const route = new InstrumentedDummyRoute();

    await route.beforeModel('foo');
    expect(beforeModel).toHaveBeenCalledWith('foo');
    expect(beforeModel.mock.contexts[0]).toBe(route);

    await route.model('bar');
    expect(model).toHaveBeenCalledWith('bar');
    expect(model.mock.contexts[0]).toBe(route);

    await route.afterModel('bax');
    expect(afterModel).toHaveBeenCalledWith('bax');
    expect(afterModel.mock.contexts[0]).toBe(route);

    await route.setupController('baz');
    expect(setupController).toHaveBeenCalledWith('baz');
    expect(setupController.mock.contexts[0]).toBe(route);

    expect(startSpan).toHaveBeenCalledTimes(4);
  });
});

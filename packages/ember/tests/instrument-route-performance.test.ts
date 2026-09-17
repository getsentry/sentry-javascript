import type Route from '@ember/routing/route';
import { startSpan } from '@sentry/browser';
import { hasSpanStreamingEnabled } from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/browser', () => ({
  startSpan: vi.fn((_options: unknown, callback: () => unknown) => callback()),
}));
vi.mock('@sentry/core', () => ({
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'sentry.origin',
  getClient: vi.fn(() => ({})),
  hasSpanStreamingEnabled: vi.fn(() => false),
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

  it('names the span after the route when span streaming is disabled', async () => {
    const { instrumentRoutePerformance } = await import('../src/utils/instrumentRoutePerformance.ts');

    class DummyRoute {
      public fullRouteName = 'dummy';

      public model(): void {}
    }

    const InstrumentedDummyRoute = instrumentRoutePerformance(
      DummyRoute as unknown as new (...args: unknown[]) => Route,
    );

    await new InstrumentedDummyRoute().model();

    expect(startSpan).toHaveBeenCalledWith(
      {
        attributes: {
          'sentry.origin': 'auto.ui.ember',
          'sentry.op': 'function',
          'code.function.name': 'model',
        },
        name: 'dummy',
        onlyIfParent: true,
      },
      expect.any(Function),
    );
  });

  it('names the span after the hook and describes it with the route when span streaming is enabled', async () => {
    vi.mocked(hasSpanStreamingEnabled).mockReturnValueOnce(true);

    const { instrumentRoutePerformance } = await import('../src/utils/instrumentRoutePerformance.ts');

    class DummyRoute {
      public fullRouteName = 'dummy';

      public model(): void {}
    }

    const InstrumentedDummyRoute = instrumentRoutePerformance(
      DummyRoute as unknown as new (...args: unknown[]) => Route,
    );

    await new InstrumentedDummyRoute().model();

    expect(startSpan).toHaveBeenCalledWith(
      {
        attributes: {
          'sentry.origin': 'auto.ui.ember',
          'sentry.op': 'function',
          'code.function.name': 'model',
          'sentry.description': 'dummy',
        },
        name: 'model',
        onlyIfParent: true,
      },
      expect.any(Function),
    );
  });
});

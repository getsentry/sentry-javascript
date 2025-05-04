import * as browser from '@sentry/browser';
import * as core from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentHydratedRouter } from '../../src/client/hydratedRouter';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual<any>('@sentry/core');
  return {
    ...actual,
    getActiveSpan: vi.fn(),
    getRootSpan: vi.fn(),
    spanToJSON: vi.fn(),
    getClient: vi.fn(),
    SEMANTIC_ATTRIBUTE_SENTRY_OP: 'op',
    SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'origin',
    SEMANTIC_ATTRIBUTE_SENTRY_SOURCE: 'source',
    GLOBAL_OBJ: globalThis,
  };
});
vi.mock('@sentry/browser', () => ({
  startBrowserTracingNavigationSpan: vi.fn(),
}));

describe('instrumentHydratedRouter', () => {
  let originalRouter: any;
  let mockRouter: any;
  let mockPageloadSpan: any;
  let mockNavigationSpan: any;

  beforeEach(() => {
    originalRouter = (globalThis as any).__reactRouterDataRouter;
    mockRouter = {
      state: {
        location: { pathname: '/foo' },
        matches: [{ route: { path: '/foo/:id' } }],
      },
      navigate: vi.fn(),
      subscribe: vi.fn(),
    };
    (globalThis as any).__reactRouterDataRouter = mockRouter;

    mockPageloadSpan = { updateName: vi.fn(), setAttribute: vi.fn() };
    mockNavigationSpan = { updateName: vi.fn(), setAttribute: vi.fn() };

    (core.getActiveSpan as any).mockReturnValue(mockPageloadSpan);
    (core.getRootSpan as any).mockImplementation((span: any) => span);
    (core.spanToJSON as any).mockImplementation((_span: any) => ({
      description: '/foo',
      op: 'pageload',
    }));
    (core.getClient as any).mockReturnValue({});
    (browser.startBrowserTracingNavigationSpan as any).mockReturnValue(mockNavigationSpan);
  });

  afterEach(() => {
    (globalThis as any).__reactRouterDataRouter = originalRouter;
    vi.clearAllMocks();
  });

  it('subscribes to the router and patches navigate', () => {
    instrumentHydratedRouter();
    expect(typeof mockRouter.navigate).toBe('function');
    expect(mockRouter.subscribe).toHaveBeenCalled();
  });

  it('updates pageload transaction name if needed', () => {
    instrumentHydratedRouter();
    expect(mockPageloadSpan.updateName).toHaveBeenCalled();
    expect(mockPageloadSpan.setAttribute).toHaveBeenCalled();
  });

  it('creates navigation transaction on navigate', () => {
    instrumentHydratedRouter();
    mockRouter.navigate('/bar');
    expect(browser.startBrowserTracingNavigationSpan).toHaveBeenCalled();
  });

  it('updates navigation transaction on state change', () => {
    instrumentHydratedRouter();
    // Simulate a state change to idle
    const callback = mockRouter.subscribe.mock.calls[0][0];
    const newState = {
      location: { pathname: '/foo' },
      matches: [{ route: { path: '/foo/:id' } }],
      navigation: { state: 'idle' },
    };
    callback(newState);
    expect(mockPageloadSpan.updateName).toHaveBeenCalled();
    expect(mockPageloadSpan.setAttribute).toHaveBeenCalled();
  });
});

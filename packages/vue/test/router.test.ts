import * as SentryBrowser from '@sentry/browser';
import type { Span, SpanAttributes } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Route } from '../src/router';
import { instrumentVueRouter } from '../src/router';

const MOCK_SPAN = {
  spanContext: () => ({ traceId: '1234', spanId: '5678' }),
};

const captureExceptionSpy = vi.spyOn(SentryBrowser, 'captureException');
vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    getActiveSpan: vi.fn().mockReturnValue({
      spanContext: () => ({ traceId: '1234', spanId: '5678' }),
    }),
  };
});

const mockVueRouter = {
  onError: vi.fn<[(error: Error) => void]>(),
  beforeEach: vi.fn<[(from: Route, to: Route, next?: () => void) => void]>(),
};

const mockNext = vi.fn();

const testRoutes: Record<string, Route> = {
  initialPageloadRoute: { matched: [], params: {}, path: '', query: {} },
  normalRoute1: {
    matched: [{ path: '/books/:bookId/chapter/:chapterId' }],
    params: {
      bookId: '12',
      chapterId: '3',
    },
    path: '/books/12/chapter/3',
    query: {
      utm_source: 'google',
    },
  },
  normalRoute2: {
    matched: [{ path: '/accounts/:accountId' }],
    params: {
      accountId: '4',
    },
    path: '/accounts/4',
    query: {},
  },
  nestedRoute: {
    matched: [{ path: '/' }, { path: '/categories' }, { path: '/categories/:categoryId' }],
    params: {
      categoryId: '1',
    },
    path: '/categories/1',
    query: {},
  },
  namedRoute: {
    matched: [{ path: '/login' }],
    name: 'login-screen',
    params: {},
    path: '/login',
    query: {},
  },
  unmatchedRoute: {
    matched: [],
    params: {},
    path: '/e8733846-20ac-488c-9871-a5cbcb647294',
    query: {},
  },
};

describe('instrumentVueRouter()', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return instrumentation that instruments VueRouter.onError', () => {
    const mockStartSpan = vi.fn().mockReturnValue(MOCK_SPAN);
    instrumentVueRouter(
      mockVueRouter,
      { routeLabel: 'name', instrumentPageLoad: true, instrumentNavigation: true },
      mockStartSpan,
    );

    // check
    expect(mockVueRouter.onError).toHaveBeenCalledTimes(1);

    const onErrorCallback = mockVueRouter.onError.mock.calls[0]![0]!;

    const testError = new Error();
    onErrorCallback(testError);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(testError, { mechanism: { handled: false } });
  });

  it.each([
    ['normalRoute1', 'normalRoute2', '/accounts/:accountId', 'route'],
    ['normalRoute1', 'nestedRoute', '/categories/:categoryId', 'route'],
    ['normalRoute2', 'namedRoute', 'login-screen', 'custom'],
    ['normalRoute2', 'unmatchedRoute', '/e8733846-20ac-488c-9871-a5cbcb647294', 'url'],
  ])(
    'should return instrumentation that instruments VueRouter.beforeEach(%s, %s) for navigations',
    (fromKey, toKey, transactionName, transactionSource) => {
      const mockStartSpan = vi.fn().mockReturnValue(MOCK_SPAN);
      instrumentVueRouter(
        mockVueRouter,
        { routeLabel: 'name', instrumentPageLoad: true, instrumentNavigation: true },
        mockStartSpan,
      );

      // check
      expect(mockVueRouter.beforeEach).toHaveBeenCalledTimes(1);
      const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0]![0]!;

      const from = testRoutes[fromKey]!;
      const to = testRoutes[toKey]!;
      beforeEachCallback(to, testRoutes['initialPageloadRoute']!, mockNext); // fake initial pageload
      beforeEachCallback(to, from, mockNext);

      expect(mockStartSpan).toHaveBeenCalledTimes(2);
      expect(mockStartSpan).toHaveBeenLastCalledWith({
        name: transactionName,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.vue',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: transactionSource,
          ...getAttributesForRoute(to),
        },
        op: 'navigation',
      });

      expect(mockNext).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    ['initialPageloadRoute', 'normalRoute1', '/books/:bookId/chapter/:chapterId', 'route'],
    ['initialPageloadRoute', 'nestedRoute', '/categories/:categoryId', 'route'],
    ['initialPageloadRoute', 'namedRoute', 'login-screen', 'custom'],
    ['initialPageloadRoute', 'unmatchedRoute', '/e8733846-20ac-488c-9871-a5cbcb647294', 'url'],
  ])(
    'should return instrumentation that instruments VueRouter.beforeEach(%s, %s) for pageloads',
    (fromKey, toKey, transactionName, transactionSource) => {
      const mockRootSpan = {
        ...MOCK_SPAN,
        getSpanJSON: vi.fn().mockReturnValue({ op: 'pageload', data: {} }),
        updateName: vi.fn(),
        setAttribute: vi.fn(),
        setAttributes: vi.fn(),
      };

      vi.spyOn(SentryCore, 'getRootSpan').mockImplementation(() => mockRootSpan as unknown as Span);

      const mockStartSpan = vi.fn().mockImplementation(_ => {
        return mockRootSpan;
      });
      instrumentVueRouter(
        mockVueRouter,
        { routeLabel: 'name', instrumentPageLoad: true, instrumentNavigation: true },
        mockStartSpan,
      );

      // no span is started for page load
      expect(mockStartSpan).not.toHaveBeenCalled();

      const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0]![0]!;

      const from = testRoutes[fromKey]!;
      const to = testRoutes[toKey]!;

      beforeEachCallback(to, from, mockNext);
      expect(mockVueRouter.beforeEach).toHaveBeenCalledTimes(1);

      expect(mockRootSpan.updateName).toHaveBeenCalledWith(transactionName);
      expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, transactionSource);
      expect(mockRootSpan.setAttributes).toHaveBeenCalledWith({
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.vue',
        ...getAttributesForRoute(to),
      });

      expect(mockNext).toHaveBeenCalledTimes(1);
    },
  );

  it('allows to configure routeLabel=path', () => {
    const mockStartSpan = vi.fn().mockReturnValue(MOCK_SPAN);
    instrumentVueRouter(
      mockVueRouter,
      { routeLabel: 'path', instrumentPageLoad: true, instrumentNavigation: true },
      mockStartSpan,
    );

    // check
    const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0]![0]!;

    const from = testRoutes.normalRoute1!;
    const to = testRoutes.namedRoute!;
    beforeEachCallback(to, testRoutes['initialPageloadRoute']!, mockNext); // fake initial pageload
    beforeEachCallback(to, from, mockNext);

    // first startTx call happens when the instrumentation is initialized (for pageloads)
    expect(mockStartSpan).toHaveBeenLastCalledWith({
      name: '/login',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.vue',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        ...getAttributesForRoute(to),
      },
      op: 'navigation',
    });
  });

  it('allows to configure routeLabel=name', () => {
    const mockStartSpan = vi.fn().mockReturnValue(MOCK_SPAN);
    instrumentVueRouter(
      mockVueRouter,
      { routeLabel: 'name', instrumentPageLoad: true, instrumentNavigation: true },
      mockStartSpan,
    );

    // check
    const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0]![0]!;

    const from = testRoutes.normalRoute1!;
    const to = testRoutes.namedRoute!;
    beforeEachCallback(to, testRoutes['initialPageloadRoute']!, mockNext); // fake initial pageload
    beforeEachCallback(to, from, mockNext);

    // first startTx call happens when the instrumentation is initialized (for pageloads)
    expect(mockStartSpan).toHaveBeenLastCalledWith({
      name: 'login-screen',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.vue',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        ...getAttributesForRoute(to),
      },
      op: 'navigation',
    });
  });

  it("doesn't overwrite a pageload transaction name it was set to custom before the router resolved the route", () => {
    const mockRootSpan = {
      ...MOCK_SPAN,
      updateName: vi.fn(),
      setAttribute: vi.fn(),
      setAttributes: vi.fn(),
      name: '',
      getSpanJSON: () => ({
        op: 'pageload',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        },
      }),
    };
    const mockStartSpan = vi.fn().mockImplementation(_ => {
      return mockRootSpan;
    });
    vi.spyOn(SentryCore, 'getRootSpan').mockImplementation(() => mockRootSpan as unknown as Span);

    instrumentVueRouter(
      mockVueRouter,
      { routeLabel: 'name', instrumentPageLoad: true, instrumentNavigation: true },
      mockStartSpan,
    );

    // check for transaction start
    expect(mockStartSpan).not.toHaveBeenCalled();

    // now we give the transaction a custom name, thereby simulating what would
    // happen when users use the `beforeNavigate` hook
    mockRootSpan.name = 'customTxnName';
    mockRootSpan.getSpanJSON = () => ({
      op: 'pageload',
      data: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
      },
    });

    const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0]![0]!;

    const to = testRoutes['normalRoute1']!;
    const from = testRoutes['initialPageloadRoute']!;

    beforeEachCallback(to, from, mockNext);

    expect(mockVueRouter.beforeEach).toHaveBeenCalledTimes(1);

    expect(mockRootSpan.updateName).not.toHaveBeenCalled();
    expect(mockRootSpan.setAttribute).not.toHaveBeenCalled();
    expect(mockRootSpan.setAttributes).toHaveBeenCalledWith({
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.vue',
      ...getAttributesForRoute(to),
    });
    expect(mockRootSpan.name).toEqual('customTxnName');
  });

  it("updates the scope's `transactionName` when a route is resolved", () => {
    const mockStartSpan = vi.fn().mockReturnValue(MOCK_SPAN);

    const scopeSetTransactionNameSpy = vi.fn();

    // @ts-expect-error - only creating a partial scope but that's fine
    vi.spyOn(SentryCore, 'getCurrentScope').mockImplementation(() => ({
      setTransactionName: scopeSetTransactionNameSpy,
    }));

    instrumentVueRouter(
      mockVueRouter,
      { routeLabel: 'name', instrumentPageLoad: true, instrumentNavigation: true },
      mockStartSpan,
    );

    const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0]![0]!;

    const from = testRoutes['initialPageloadRoute']!;
    const to = testRoutes['normalRoute1']!;

    beforeEachCallback(to, from, mockNext);

    expect(scopeSetTransactionNameSpy).toHaveBeenCalledTimes(1);
    expect(scopeSetTransactionNameSpy).toHaveBeenCalledWith('/books/:bookId/chapter/:chapterId');
  });

  it.each([
    [false, 0],
    [true, 1],
  ])(
    'should return instrumentation that considers the instrumentPageLoad = %j',
    (instrumentPageLoad, expectedCallsAmount) => {
      const mockRootSpan = {
        ...MOCK_SPAN,
        updateName: vi.fn(),
        setData: vi.fn(),
        setAttribute: vi.fn(),
        setAttributes: vi.fn(),
        name: '',
        getSpanJSON: () => ({
          op: 'pageload',
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          },
        }),
      };
      vi.spyOn(SentryCore, 'getRootSpan').mockImplementation(() => mockRootSpan as unknown as Span);

      const mockStartSpan = vi.fn();
      instrumentVueRouter(
        mockVueRouter,
        { routeLabel: 'name', instrumentPageLoad, instrumentNavigation: true },
        mockStartSpan,
      );

      // check
      expect(mockVueRouter.beforeEach).toHaveBeenCalledTimes(1);

      const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0]![0]!;
      beforeEachCallback(testRoutes['normalRoute1']!, testRoutes['initialPageloadRoute']!, mockNext);

      expect(mockRootSpan.updateName).toHaveBeenCalledTimes(expectedCallsAmount);
      expect(mockStartSpan).not.toHaveBeenCalled();
    },
  );

  it.each([
    [false, 0],
    [true, 1],
  ])(
    'should return instrumentation that considers the instrumentNavigation = %j',
    (instrumentNavigation, expectedCallsAmount) => {
      const mockStartSpan = vi.fn().mockReturnValue(MOCK_SPAN);
      instrumentVueRouter(
        mockVueRouter,
        { routeLabel: 'name', instrumentPageLoad: true, instrumentNavigation },
        mockStartSpan,
      );

      // check
      expect(mockVueRouter.beforeEach).toHaveBeenCalledTimes(1);

      const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0]![0]!;
      beforeEachCallback(testRoutes['normalRoute1']!, testRoutes['initialPageloadRoute']!, mockNext); // fake initial pageload
      beforeEachCallback(testRoutes['normalRoute2']!, testRoutes['normalRoute1']!, mockNext);

      expect(mockStartSpan).toHaveBeenCalledTimes(expectedCallsAmount);
    },
  );

  it("doesn't throw when `next` is not available in the beforeEach callback (Vue Router 4)", () => {
    const mockStartSpan = vi.fn().mockReturnValue(MOCK_SPAN);
    instrumentVueRouter(
      mockVueRouter,
      { routeLabel: 'path', instrumentPageLoad: true, instrumentNavigation: true },
      mockStartSpan,
    );

    const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0]![0]!;

    const from = testRoutes.normalRoute1!;
    const to = testRoutes.namedRoute!;
    beforeEachCallback(to, testRoutes['initialPageloadRoute']!, mockNext); // fake initial pageload
    beforeEachCallback(to, from, undefined);

    // first startTx call happens when the instrumentation is initialized (for pageloads)
    expect(mockStartSpan).toHaveBeenLastCalledWith({
      name: '/login',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.vue',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        ...getAttributesForRoute(to),
      },
      op: 'navigation',
    });
  });
});

// Small helper function to get flattened attributes for test comparison
function getAttributesForRoute(route: Route): SpanAttributes {
  const { params, query } = route;

  const attributes: SpanAttributes = {};

  for (const key of Object.keys(params)) {
    attributes[`url.path.parameter.${key}`] = params[key];
    attributes[`params.${key}`] = params[key];
  }
  for (const key of Object.keys(query)) {
    const value = query[key];
    if (value) {
      attributes[`query.${key}`] = value;
    }
  }

  return attributes;
}

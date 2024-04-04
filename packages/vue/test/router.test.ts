import * as SentryBrowser from '@sentry/browser';
import * as SentryCore from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import type { Span, SpanAttributes } from '@sentry/types';

import type { Route } from '../src/router';
import { instrumentVueRouter } from '../src/router';

const captureExceptionSpy = jest.spyOn(SentryBrowser, 'captureException');
jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    getActiveSpan: jest.fn().mockReturnValue({}),
  };
});

const mockVueRouter = {
  onError: jest.fn<void, [(error: Error) => void]>(),
  beforeEach: jest.fn<void, [(from: Route, to: Route, next?: () => void) => void]>(),
};

const mockNext = jest.fn();

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
    jest.clearAllMocks();
  });

  it('should return instrumentation that instruments VueRouter.onError', () => {
    const mockStartSpan = jest.fn();
    instrumentVueRouter(
      mockVueRouter,
      { routeLabel: 'name', instrumentPageLoad: true, instrumentNavigation: true },
      mockStartSpan,
    );

    // check
    expect(mockVueRouter.onError).toHaveBeenCalledTimes(1);

    const onErrorCallback = mockVueRouter.onError.mock.calls[0][0];

    const testError = new Error();
    onErrorCallback(testError);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(testError, { mechanism: { handled: false } });
  });

  it.each([
    ['normalRoute1', 'normalRoute2', '/accounts/:accountId', 'route'],
    ['normalRoute2', 'namedRoute', 'login-screen', 'custom'],
    ['normalRoute2', 'unmatchedRoute', '/e8733846-20ac-488c-9871-a5cbcb647294', 'url'],
  ])(
    'should return instrumentation that instruments VueRouter.beforeEach(%s, %s) for navigations',
    (fromKey, toKey, transactionName, transactionSource) => {
      const mockStartSpan = jest.fn();
      instrumentVueRouter(
        mockVueRouter,
        { routeLabel: 'name', instrumentPageLoad: true, instrumentNavigation: true },
        mockStartSpan,
      );

      // check
      expect(mockVueRouter.beforeEach).toHaveBeenCalledTimes(1);
      const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0][0];

      const from = testRoutes[fromKey];
      const to = testRoutes[toKey];
      beforeEachCallback(to, from, mockNext);

      expect(mockStartSpan).toHaveBeenCalledTimes(1);
      expect(mockStartSpan).toHaveBeenCalledWith({
        name: transactionName,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.vue',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: transactionSource,
          ...getAttributesForRoute(to),
        },
        op: 'navigation',
      });

      expect(mockNext).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['initialPageloadRoute', 'normalRoute1', '/books/:bookId/chapter/:chapterId', 'route'],
    ['initialPageloadRoute', 'namedRoute', 'login-screen', 'custom'],
    ['initialPageloadRoute', 'unmatchedRoute', '/e8733846-20ac-488c-9871-a5cbcb647294', 'url'],
  ])(
    'should return instrumentation that instruments VueRouter.beforeEach(%s, %s) for pageloads',
    (fromKey, toKey, transactionName, transactionSource) => {
      const mockRootSpan = {
        getSpanJSON: jest.fn().mockReturnValue({ op: 'pageload' }),
        updateName: jest.fn(),
        setAttribute: jest.fn(),
        setAttributes: jest.fn(),
      };

      jest.spyOn(SentryCore, 'getRootSpan').mockImplementation(() => mockRootSpan as unknown as Span);

      const mockStartSpan = jest.fn().mockImplementation(_ => {
        return mockRootSpan;
      });
      instrumentVueRouter(
        mockVueRouter,
        { routeLabel: 'name', instrumentPageLoad: true, instrumentNavigation: true },
        mockStartSpan,
      );

      // no span is started for page load
      expect(mockStartSpan).not.toHaveBeenCalled();

      const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0][0];

      const from = testRoutes[fromKey];
      const to = testRoutes[toKey];

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
    const mockStartSpan = jest.fn();
    instrumentVueRouter(
      mockVueRouter,
      { routeLabel: 'path', instrumentPageLoad: true, instrumentNavigation: true },
      mockStartSpan,
    );

    // check
    const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0][0];

    const from = testRoutes.normalRoute1;
    const to = testRoutes.namedRoute;
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
    const mockStartSpan = jest.fn();
    instrumentVueRouter(
      mockVueRouter,
      { routeLabel: 'name', instrumentPageLoad: true, instrumentNavigation: true },
      mockStartSpan,
    );

    // check
    const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0][0];

    const from = testRoutes.normalRoute1;
    const to = testRoutes.namedRoute;
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
      updateName: jest.fn(),
      setAttribute: jest.fn(),
      setAttributes: jest.fn(),
      name: '',
      getSpanJSON: () => ({
        op: 'pageload',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        },
      }),
    };
    const mockStartSpan = jest.fn().mockImplementation(_ => {
      return mockRootSpan;
    });
    jest.spyOn(SentryCore, 'getRootSpan').mockImplementation(() => mockRootSpan as unknown as Span);

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

    const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0][0];

    const to = testRoutes['normalRoute1'];
    const from = testRoutes['initialPageloadRoute'];

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
    const mockStartSpan = jest.fn().mockImplementation(_ => {
      return {};
    });

    const scopeSetTransactionNameSpy = jest.fn();

    // @ts-expect-error - only creating a partial scope but that's fine
    jest.spyOn(SentryCore, 'getCurrentScope').mockImplementation(() => ({
      setTransactionName: scopeSetTransactionNameSpy,
    }));

    instrumentVueRouter(
      mockVueRouter,
      { routeLabel: 'name', instrumentPageLoad: true, instrumentNavigation: true },
      mockStartSpan,
    );

    const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0][0];

    const from = testRoutes['initialPageloadRoute'];
    const to = testRoutes['normalRoute1'];

    beforeEachCallback(to, from, mockNext);

    expect(scopeSetTransactionNameSpy).toHaveBeenCalledTimes(1);
    expect(scopeSetTransactionNameSpy).toHaveBeenCalledWith('/books/:bookId/chapter/:chapterId');
  });

  test.each([
    [false, 0],
    [true, 1],
  ])(
    'should return instrumentation that considers the instrumentPageLoad = %p',
    (instrumentPageLoad, expectedCallsAmount) => {
      const mockRootSpan = {
        updateName: jest.fn(),
        setData: jest.fn(),
        setAttribute: jest.fn(),
        setAttributes: jest.fn(),
        name: '',
        getSpanJSON: () => ({
          op: 'pageload',
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          },
        }),
      };
      jest.spyOn(SentryCore, 'getRootSpan').mockImplementation(() => mockRootSpan as unknown as Span);

      const mockStartSpan = jest.fn();
      instrumentVueRouter(
        mockVueRouter,
        { routeLabel: 'name', instrumentPageLoad, instrumentNavigation: true },
        mockStartSpan,
      );

      // check
      expect(mockVueRouter.beforeEach).toHaveBeenCalledTimes(1);

      const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0][0];
      beforeEachCallback(testRoutes['normalRoute1'], testRoutes['initialPageloadRoute'], mockNext);

      expect(mockRootSpan.updateName).toHaveBeenCalledTimes(expectedCallsAmount);
      expect(mockStartSpan).not.toHaveBeenCalled();
    },
  );

  test.each([
    [false, 0],
    [true, 1],
  ])(
    'should return instrumentation that considers the instrumentNavigation = %p',
    (instrumentNavigation, expectedCallsAmount) => {
      const mockStartSpan = jest.fn();
      instrumentVueRouter(
        mockVueRouter,
        { routeLabel: 'name', instrumentPageLoad: true, instrumentNavigation },
        mockStartSpan,
      );

      // check
      expect(mockVueRouter.beforeEach).toHaveBeenCalledTimes(1);

      const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0][0];
      beforeEachCallback(testRoutes['normalRoute2'], testRoutes['normalRoute1'], mockNext);

      expect(mockStartSpan).toHaveBeenCalledTimes(expectedCallsAmount);
    },
  );

  it("doesn't throw when `next` is not available in the beforeEach callback (Vue Router 4)", () => {
    const mockStartSpan = jest.fn();
    instrumentVueRouter(
      mockVueRouter,
      { routeLabel: 'path', instrumentPageLoad: true, instrumentNavigation: true },
      mockStartSpan,
    );

    const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0][0];

    const from = testRoutes.normalRoute1;
    const to = testRoutes.namedRoute;
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

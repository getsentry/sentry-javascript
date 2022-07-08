import * as SentryBrowser from '@sentry/browser';

import { vueRouterInstrumentation } from '../src';
import { Route } from '../src/router';

const captureExceptionSpy = jest.spyOn(SentryBrowser, 'captureException');

const mockVueRouter = {
  onError: jest.fn<void, [(error: Error) => void]>(),
  beforeEach: jest.fn<void, [(from: Route, to: Route, next: () => void) => void]>(),
};

const mockStartTransaction = jest.fn();
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

describe('vueRouterInstrumentation()', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return instrumentation that instruments VueRouter.onError', () => {
    // create instrumentation
    const instrument = vueRouterInstrumentation(mockVueRouter);

    // instrument
    instrument(mockStartTransaction);

    // check
    expect(mockVueRouter.onError).toHaveBeenCalledTimes(1);

    const onErrorCallback = mockVueRouter.onError.mock.calls[0][0];

    const testError = new Error();
    onErrorCallback(testError);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(testError);
  });

  it.each([
    ['initialPageloadRoute', 'normalRoute1', 'pageload', '/books/:bookId/chapter/:chapterId', 'route'],
    ['normalRoute1', 'normalRoute2', 'navigation', '/accounts/:accountId', 'route'],
    ['normalRoute2', 'namedRoute', 'navigation', 'login-screen', 'custom'],
    ['normalRoute2', 'unmatchedRoute', 'navigation', '/e8733846-20ac-488c-9871-a5cbcb647294', 'url'],
  ])(
    'should return instrumentation that instruments VueRouter.beforeEach(%s, %s)',
    (fromKey, toKey, op, transactionName, transactionSource) => {
      // create instrumentation
      const instrument = vueRouterInstrumentation(mockVueRouter);

      // instrument
      instrument(mockStartTransaction, true, true);

      // check
      expect(mockVueRouter.beforeEach).toHaveBeenCalledTimes(1);
      const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0][0];

      const from = testRoutes[fromKey];
      const to = testRoutes[toKey];
      beforeEachCallback(to, from, mockNext);

      expect(mockStartTransaction).toHaveBeenCalledTimes(1);
      expect(mockStartTransaction).toHaveBeenCalledWith({
        name: transactionName,
        metadata: {
          source: transactionSource,
        },
        data: {
          params: to.params,
          query: to.query,
        },
        op: op,
        tags: {
          'routing.instrumentation': 'vue-router',
        },
      });

      expect(mockNext).toHaveBeenCalledTimes(1);
    },
  );

  test.each([
    [undefined, 1],
    [false, 0],
    [true, 1],
  ])(
    'should return instrumentation that considers the startTransactionOnPageLoad option = %p',
    (startTransactionOnPageLoad, expectedCallsAmount) => {
      // create instrumentation
      const instrument = vueRouterInstrumentation(mockVueRouter);

      // instrument
      instrument(mockStartTransaction, startTransactionOnPageLoad, true);

      // check
      expect(mockVueRouter.beforeEach).toHaveBeenCalledTimes(1);

      const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0][0];
      beforeEachCallback(testRoutes['normalRoute1'], testRoutes['initialPageloadRoute'], mockNext);

      expect(mockStartTransaction).toHaveBeenCalledTimes(expectedCallsAmount);
    },
  );

  test.each([
    [undefined, 1],
    [false, 0],
    [true, 1],
  ])(
    'should return instrumentation that considers the startTransactionOnLocationChange option = %p',
    (startTransactionOnLocationChange, expectedCallsAmount) => {
      // create instrumentation
      const instrument = vueRouterInstrumentation(mockVueRouter);

      // instrument
      instrument(mockStartTransaction, true, startTransactionOnLocationChange);

      // check
      expect(mockVueRouter.beforeEach).toHaveBeenCalledTimes(1);

      const beforeEachCallback = mockVueRouter.beforeEach.mock.calls[0][0];
      beforeEachCallback(testRoutes['normalRoute2'], testRoutes['normalRoute1'], mockNext);

      expect(mockStartTransaction).toHaveBeenCalledTimes(expectedCallsAmount);
    },
  );
});

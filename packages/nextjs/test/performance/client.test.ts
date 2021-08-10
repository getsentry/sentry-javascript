import { default as Router } from 'next/router';

import { nextRouterInstrumentation } from '../../src/performance/client';

let readyCalled = false;
jest.mock('next/router', () => {
  const router = {};
  Object.setPrototypeOf(router, { changeState: () => undefined });
  return {
    default: {
      router,
      route: '/[user]/posts/[id]',
      readyCallbacks: [],
      ready(cb: () => void) {
        readyCalled = true;
        return cb();
      },
    },
  };
});

describe('client', () => {
  beforeEach(() => {
    readyCalled = false;
    if (Router.router) {
      Router.router.changeState('pushState', '/[user]/posts/[id]', '/abhi/posts/123', {});
    }
  });

  describe('nextRouterInstrumentation', () => {
    it('waits for Router.ready()', () => {
      const mockStartTransaction = jest.fn();
      expect(readyCalled).toBe(false);
      nextRouterInstrumentation(mockStartTransaction);
      expect(readyCalled).toBe(true);
    });

    it('creates a pageload transaction', () => {
      const mockStartTransaction = jest.fn();
      nextRouterInstrumentation(mockStartTransaction);
      expect(mockStartTransaction).toHaveBeenCalledTimes(1);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/[user]/posts/[id]',
        op: 'pageload',
        tags: {
          'routing.instrumentation': 'next-router',
        },
      });
    });

    it('does not create a pageload transaction if option not given', () => {
      const mockStartTransaction = jest.fn();
      nextRouterInstrumentation(mockStartTransaction, false);
      expect(mockStartTransaction).toHaveBeenCalledTimes(0);
    });

    describe('navigation transactions', () => {
      // [name, in, out]
      const table: Array<[string, [string, string, string, Record<string, unknown>], Record<string, unknown>]> = [
        [
          'creates parameterized transaction',
          ['pushState', '/posts/[id]', '/posts/32', {}],
          {
            name: '/posts/[id]',
            op: 'navigation',
            tags: {
              from: '/[user]/posts/[id]',
              method: 'pushState',
              'routing.instrumentation': 'next-router',
            },
          },
        ],
        [
          'strips query parameters',
          ['replaceState', '/posts/[id]?name=cat', '/posts/32?name=cat', {}],
          {
            name: '/posts/[id]',
            op: 'navigation',
            tags: {
              from: '/[user]/posts/[id]',
              method: 'replaceState',
              'routing.instrumentation': 'next-router',
            },
          },
        ],
        [
          'creates regular transactions',
          ['pushState', '/about', '/about', {}],
          {
            name: '/about',
            op: 'navigation',
            tags: {
              from: '/[user]/posts/[id]',
              method: 'pushState',
              'routing.instrumentation': 'next-router',
            },
          },
        ],
      ];

      it.each(table)('%s', (...test) => {
        const mockStartTransaction = jest.fn();
        nextRouterInstrumentation(mockStartTransaction, false);
        expect(mockStartTransaction).toHaveBeenCalledTimes(0);

        // @ts-ignore we can spread into test
        Router.router?.changeState(...test[1]);
        expect(mockStartTransaction).toHaveBeenLastCalledWith(test[2]);
      });
    });

    it('does not create navigation transaction with the same name', () => {
      const mockStartTransaction = jest.fn();
      nextRouterInstrumentation(mockStartTransaction, false);
      expect(mockStartTransaction).toHaveBeenCalledTimes(0);

      Router.router?.changeState('pushState', '/login', '/login', {});
      expect(mockStartTransaction).toHaveBeenCalledTimes(1);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/login',
        op: 'navigation',
        tags: { from: '/[user]/posts/[id]', method: 'pushState', 'routing.instrumentation': 'next-router' },
      });

      Router.router?.changeState('pushState', '/login', '/login', {});
      expect(mockStartTransaction).toHaveBeenCalledTimes(1);

      Router.router?.changeState('pushState', '/posts/[id]', '/posts/123', {});
      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/posts/[id]',
        op: 'navigation',
        tags: { from: '/login', method: 'pushState', 'routing.instrumentation': 'next-router' },
      });
    });
  });
});

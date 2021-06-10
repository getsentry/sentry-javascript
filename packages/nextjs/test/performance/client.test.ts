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

type Table<I = string, O = string> = Array<{ in: I; out: O }>;

describe('client', () => {
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

    it('creates navigation transactions', () => {
      const mockStartTransaction = jest.fn();
      nextRouterInstrumentation(mockStartTransaction, false);
      expect(mockStartTransaction).toHaveBeenCalledTimes(0);

      const table: Table<Array<string | unknown>, Record<string, unknown>> = [
        {
          in: ['pushState', '/posts/[id]', '/posts/32', {}],
          out: {
            name: '/posts/[id]',
            op: 'navigation',
            tags: {
              from: '/posts/[id]',
              method: 'pushState',
              'routing.instrumentation': 'next-router',
            },
          },
        },
        {
          in: ['replaceState', '/posts/[id]?name=cat', '/posts/32?name=cat', {}],
          out: {
            name: '/posts/[id]',
            op: 'navigation',
            tags: {
              from: '/posts/[id]',
              method: 'replaceState',
              'routing.instrumentation': 'next-router',
            },
          },
        },
        {
          in: ['pushState', '/about', '/about', {}],
          out: {
            name: '/about',
            op: 'navigation',
            tags: {
              from: '/about',
              method: 'pushState',
              'routing.instrumentation': 'next-router',
            },
          },
        },
      ];

      table.forEach(test => {
        // @ts-ignore changeState can be called with array spread
        Router.router?.changeState(...test.in);
        expect(mockStartTransaction).toHaveBeenLastCalledWith(test.out);
      });
    });
  });
});

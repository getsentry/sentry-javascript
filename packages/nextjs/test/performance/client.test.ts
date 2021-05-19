import { default as Router } from 'next/router';

import { nextRouterInstrumentation, removeQueryParams } from '../../src/performance/client';

let readyCalled = false;
jest.mock('next/router', () => ({
  default: {
    router: {
      changeState: jest.fn(),
    },
    route: '/[user]/posts/[id]',
    readyCallbacks: [],
    ready(cb: () => void) {
      readyCalled = true;
      return cb();
    },
  },
}));

// [in, out]
type Table = Array<{ in: string; out: string }>;

beforeEach(() => {
  readyCalled = false;
});

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
  });

  describe('removeQueryParams()', () => {
    it('removes query params from an url', () => {
      const table: Table = [
        { in: '/posts/[id]/[comment]?name=ferret&color=purple', out: '/posts/[id]/[comment]' },
        { in: '/posts/[id]/[comment]?', out: '/posts/[id]/[comment]' },
        { in: '/about?', out: '/about' },
      ];

      table.forEach(test => {
        expect(removeQueryParams(test.in)).toEqual(test.out);
      });
    });
  });
});

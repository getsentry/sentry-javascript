import { Component } from '@angular/core';
import type { ActivatedRouteSnapshot } from '@angular/router';
import type { Hub } from '@sentry/types';

import { instrumentAngularRouting, TraceClassDecorator, TraceDirective, TraceMethodDecorator } from '../src';
import { getParameterizedRouteFromSnapshot } from '../src/tracing';
import { AppComponent, TestEnv } from './utils/index';

let transaction: any;

const defaultStartTransaction = (ctx: any) => {
  transaction = {
    ...ctx,
    setName: jest.fn(name => (transaction.name = name)),
  };

  return transaction;
};

jest.mock('@sentry/browser', () => {
  const original = jest.requireActual('@sentry/browser');
  return {
    ...original,
    getCurrentHub: () => {
      return {
        getScope: () => {
          return {
            getTransaction: () => {
              return transaction;
            },
          };
        },
      } as unknown as Hub;
    },
  };
});

describe('Angular Tracing', () => {
  beforeEach(() => {
    transaction = undefined;
  });

  describe('instrumentAngularRouting', () => {
    it('should attach the transaction source on the pageload transaction', () => {
      const startTransaction = jest.fn();
      instrumentAngularRouting(startTransaction);

      expect(startTransaction).toHaveBeenCalledWith({
        name: '/',
        op: 'pageload',
        metadata: { source: 'url' },
      });
    });
  });

  describe('getParameterizedRouteFromSnapshot', () => {
    it.each([
      ['returns `/` empty object if the route no children', {}, '/'],
      [
        'returns the route of a snapshot without children',
        {
          firstChild: { routeConfig: { path: 'users/:id' } },
        },
        '/users/:id/',
      ],
      [
        'returns the complete route of a snapshot with children',
        {
          firstChild: {
            routeConfig: { path: 'orgs/:orgId' },
            firstChild: {
              routeConfig: { path: 'projects/:projId' },
              firstChild: { routeConfig: { path: 'overview' } },
            },
          },
        },
        '/orgs/:orgId/projects/:projId/overview/',
      ],
    ])('%s', (_, routeSnapshot, expectedParams) => {
      expect(getParameterizedRouteFromSnapshot(routeSnapshot as unknown as ActivatedRouteSnapshot)).toEqual(
        expectedParams,
      );
    });
  });

  describe('TraceService', () => {
    it('does not change the transaction name if the source is something other than `url`', async () => {
      const customStartTransaction = jest.fn((ctx: any) => {
        transaction = {
          ...ctx,
          metadata: {
            ...ctx.metadata,
            source: 'custom',
          },
          setName: jest.fn(name => (transaction.name = name)),
        };

        return transaction;
      });

      const env = await TestEnv.setup({
        customStartTransaction,
        routes: [
          {
            path: '',
            component: AppComponent,
          },
        ],
      });

      const url = '/';

      await env.navigateInAngular(url);

      expect(customStartTransaction).toHaveBeenCalledWith({
        name: url,
        op: 'pageload',
        metadata: { source: 'url' },
      });

      expect(transaction.setName).toHaveBeenCalledTimes(0);
      expect(transaction.name).toEqual(url);
      expect(transaction.metadata.source).toBe('custom');

      env.destroy();
    });

    it('re-assigns routing span on navigation start with active transaction.', async () => {
      const customStartTransaction = jest.fn(defaultStartTransaction);

      const env = await TestEnv.setup({
        customStartTransaction,
      });

      const finishMock = jest.fn();
      transaction.startChild = jest.fn(() => ({
        finish: finishMock,
      }));

      await env.navigateInAngular('/');

      expect(finishMock).toHaveBeenCalledTimes(1);

      env.destroy();
    });

    it('finishes routing span on navigation end', async () => {
      const customStartTransaction = jest.fn(defaultStartTransaction);

      const env = await TestEnv.setup({
        customStartTransaction,
      });

      const finishMock = jest.fn();
      transaction.startChild = jest.fn(() => ({
        finish: finishMock,
      }));

      await env.navigateInAngular('/');

      expect(finishMock).toHaveBeenCalledTimes(1);

      env.destroy();
    });

    describe('URL parameterization', () => {
      it.each([
        [
          'handles the root URL correctly',
          '/',
          '/',
          [
            {
              path: '',
              component: AppComponent,
            },
          ],
        ],
        [
          'does not alter static routes',
          '/books',
          '/books/',
          [
            {
              path: 'books',
              component: AppComponent,
            },
          ],
        ],
        [
          'parameterizes IDs in the URL',
          '/books/1/details',
          '/books/:bookId/details/',
          [
            {
              path: 'books/:bookId/details',
              component: AppComponent,
            },
          ],
        ],
        [
          'parameterizes multiple IDs in the URL',
          '/org/sentry/projects/1234/events/04bc6846-4a1e-4af5-984a-003258f33e31',
          '/org/:orgId/projects/:projId/events/:eventId/',
          [
            {
              path: 'org/:orgId/projects/:projId/events/:eventId',
              component: AppComponent,
            },
          ],
        ],
        [
          'parameterizes URLs from route with child routes',
          '/org/sentry/projects/1234/events/04bc6846-4a1e-4af5-984a-003258f33e31',
          '/org/:orgId/projects/:projId/events/:eventId/',
          [
            {
              path: 'org/:orgId',
              component: AppComponent,
              children: [
                {
                  path: 'projects/:projId',
                  component: AppComponent,
                  children: [
                    {
                      path: 'events/:eventId',
                      component: AppComponent,
                    },
                  ],
                },
              ],
            },
          ],
        ],
      ])('%s and sets the source to `route`', async (_, url, result, routes) => {
        const customStartTransaction = jest.fn(defaultStartTransaction);
        const env = await TestEnv.setup({
          customStartTransaction,
          routes,
          startTransactionOnPageLoad: false,
        });

        await env.navigateInAngular(url);

        expect(customStartTransaction).toHaveBeenCalledWith({
          name: url,
          op: 'navigation',
          metadata: { source: 'url' },
        });
        expect(transaction.setName).toHaveBeenCalledWith(result, 'route');

        env.destroy();
      });
    });
  });

  describe('TraceDirective', () => {
    it('should create an instance', () => {
      const directive = new TraceDirective();
      expect(directive).toBeTruthy();
    });

    it('should create a child tracingSpan on init', async () => {
      const directive = new TraceDirective();
      const customStartTransaction = jest.fn(defaultStartTransaction);

      const env = await TestEnv.setup({
        components: [TraceDirective],
        customStartTransaction,
        useTraceService: false,
      });

      transaction.startChild = jest.fn();

      directive.ngOnInit();

      expect(transaction.startChild).toHaveBeenCalledWith({
        op: 'ui.angular.init',
        description: '<unknown>',
      });

      env.destroy();
    });

    it('should use component name as span description', async () => {
      const directive = new TraceDirective();
      const finishMock = jest.fn();
      const customStartTransaction = jest.fn(defaultStartTransaction);

      const env = await TestEnv.setup({
        components: [TraceDirective],
        customStartTransaction,
        useTraceService: false,
      });

      transaction.startChild = jest.fn(() => ({
        finish: finishMock,
      }));

      directive.componentName = 'test-component';
      directive.ngOnInit();

      expect(transaction.startChild).toHaveBeenCalledWith({
        op: 'ui.angular.init',
        description: '<test-component>',
      });

      env.destroy();
    });

    it('should finish tracingSpan after view init', async () => {
      const directive = new TraceDirective();
      const finishMock = jest.fn();
      const customStartTransaction = jest.fn(defaultStartTransaction);

      const env = await TestEnv.setup({
        components: [TraceDirective],
        customStartTransaction,
        useTraceService: false,
      });

      transaction.startChild = jest.fn(() => ({
        finish: finishMock,
      }));

      directive.ngOnInit();
      directive.ngAfterViewInit();

      expect(finishMock).toHaveBeenCalledTimes(1);

      env.destroy();
    });
  });

  describe('TraceClassDecorator', () => {
    const origNgOnInitMock = jest.fn();
    const origNgAfterViewInitMock = jest.fn();

    @Component({
      selector: 'layout-header',
      template: '<router-outlet></router-outlet>',
    })
    @TraceClassDecorator()
    class DecoratedComponent {
      public ngOnInit() {
        origNgOnInitMock();
      }
      public ngAfterViewInit() {
        origNgAfterViewInitMock();
      }
    }

    it('Instruments `ngOnInit` and `ngAfterViewInit` methods of the decorated class', async () => {
      const finishMock = jest.fn();
      const startChildMock = jest.fn(() => ({
        finish: finishMock,
      }));

      const customStartTransaction = jest.fn((ctx: any) => {
        transaction = {
          ...ctx,
          startChild: startChildMock,
        };

        return transaction;
      });

      const env = await TestEnv.setup({
        customStartTransaction,
        components: [DecoratedComponent],
        defaultComponent: DecoratedComponent,
        useTraceService: false,
      });

      expect(transaction.startChild).toHaveBeenCalledWith({
        description: '<DecoratedComponent>',
        op: 'ui.angular.init',
      });

      expect(origNgOnInitMock).toHaveBeenCalledTimes(1);
      expect(origNgAfterViewInitMock).toHaveBeenCalledTimes(1);
      expect(finishMock).toHaveBeenCalledTimes(1);

      env.destroy();
    });
  });

  describe('TraceMethodDecorator', () => {
    const origNgOnInitMock = jest.fn();
    const origNgAfterViewInitMock = jest.fn();

    @Component({
      selector: 'layout-header',
      template: '<router-outlet></router-outlet>',
    })
    class DecoratedComponent {
      @TraceMethodDecorator()
      public ngOnInit() {
        origNgOnInitMock();
      }
      @TraceMethodDecorator()
      public ngAfterViewInit() {
        origNgAfterViewInitMock();
      }
    }

    it('Instruments `ngOnInit` and `ngAfterViewInit` methods of the decorated class', async () => {
      const startChildMock = jest.fn();

      const customStartTransaction = jest.fn((ctx: any) => {
        transaction = {
          ...ctx,
          startChild: startChildMock,
        };

        return transaction;
      });

      const env = await TestEnv.setup({
        customStartTransaction,
        components: [DecoratedComponent],
        defaultComponent: DecoratedComponent,
        useTraceService: false,
      });

      expect(transaction.startChild).toHaveBeenCalledTimes(2);
      expect(transaction.startChild.mock.calls[0][0]).toEqual({
        description: '<DecoratedComponent>',
        op: 'ui.angular.ngOnInit',
        startTimestamp: expect.any(Number),
        endTimestamp: expect.any(Number),
      });

      expect(transaction.startChild.mock.calls[1][0]).toEqual({
        description: '<DecoratedComponent>',
        op: 'ui.angular.ngAfterViewInit',
        startTimestamp: expect.any(Number),
        endTimestamp: expect.any(Number),
      });

      expect(origNgOnInitMock).toHaveBeenCalledTimes(1);
      expect(origNgAfterViewInitMock).toHaveBeenCalledTimes(1);

      env.destroy();
    });
  });
});

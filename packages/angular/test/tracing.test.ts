import { ActivatedRouteSnapshot, Event, NavigationStart, ResolveEnd, Router } from '@angular/router';
import { Hub, Transaction } from '@sentry/types';
import { Subject } from 'rxjs';

import { instrumentAngularRouting, TraceService } from '../src/index';
import { getParameterizedRouteFromSnapshot } from '../src/tracing';

let transaction: any;
let customStartTransaction: (context: any) => Transaction | undefined;

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
  const startTransaction = jest.fn();

  describe('instrumentAngularRouting', () => {
    it('should attach the transaction source on the pageload transaction', () => {
      instrumentAngularRouting(startTransaction);
      expect(startTransaction).toHaveBeenCalledWith({
        name: '/',
        op: 'pageload',
        metadata: { source: 'url' },
      });
    });
  });

  describe('TraceService', () => {
    let traceService: TraceService;
    const routerEvents$: Subject<Event> = new Subject();
    const mockedRouter: Partial<Router> = {
      events: routerEvents$,
    };

    beforeEach(() => {
      instrumentAngularRouting(startTransaction);
      jest.resetAllMocks();
      traceService = new TraceService(mockedRouter as Router);
    });

    afterEach(() => {
      traceService.ngOnDestroy();
    });

    it('attaches the transaction source on a navigation change', () => {
      routerEvents$.next(new NavigationStart(0, 'user/123/credentials'));

      expect(startTransaction).toHaveBeenCalledTimes(1);
      expect(startTransaction).toHaveBeenCalledWith({
        name: 'user/123/credentials',
        op: 'navigation',
        metadata: { source: 'url' },
      });
    });

    describe('URL parameterization', () => {
      // TODO: These tests are real unit tests in the sense that they only test TraceService
      //       and we essentially just simulate a router navigation by firing the respective
      //       routing events and providing the raw URL + the resolved route parameters.
      //       In the future we should add more "wholesome" tests that let the Angular router
      //       do its thing (e.g. by calling router.navigate) and we check how our service
      //       reacts to it.
      //       Once we set up Jest for testing Angular, we can use TestBed to inject an actual
      //       router instance into TraceService and add more tests.

      beforeEach(() => {
        transaction = undefined;
        customStartTransaction = jest.fn((ctx: any) => {
          transaction = {
            ...ctx,
            setName: jest.fn(name => (transaction.name = name)),
          };
          return transaction;
        });
      });

      it.each([
        [
          'handles the root URL correctly',
          '',
          {
            root: { firstChild: { routeConfig: null } },
          },
          '/',
        ],
        [
          'does not alter static routes',
          '/books/',
          {
            root: { firstChild: { routeConfig: { path: 'books' } } },
          },
          '/books/',
        ],
        [
          'parameterizes IDs in the URL',
          '/books/1/details',
          {
            root: { firstChild: { routeConfig: { path: 'books/:bookId/details' } } },
          },
          '/books/:bookId/details/',
        ],
        [
          'parameterizes multiple IDs in the URL',
          '/org/sentry/projects/1234/events/04bc6846-4a1e-4af5-984a-003258f33e31',
          {
            root: { firstChild: { routeConfig: { path: 'org/:orgId/projects/:projId/events/:eventId' } } },
          },
          '/org/:orgId/projects/:projId/events/:eventId/',
        ],
        [
          'parameterizes URLs from route with child routes',
          '/org/sentry/projects/1234/events/04bc6846-4a1e-4af5-984a-003258f33e31',
          {
            root: {
              firstChild: {
                routeConfig: { path: 'org/:orgId' },
                firstChild: {
                  routeConfig: { path: 'projects/:projId' },
                  firstChild: { routeConfig: { path: 'events/:eventId' } },
                },
              },
            },
          },
          '/org/:orgId/projects/:projId/events/:eventId/',
        ],
      ])('%s and sets the source to `route`', (_, url, routerState, result) => {
        instrumentAngularRouting(customStartTransaction, false, true);

        // this event starts the transaction
        routerEvents$.next(new NavigationStart(0, url));

        expect(customStartTransaction).toHaveBeenCalledWith({
          name: url,
          op: 'navigation',
          metadata: { source: 'url' },
        });

        // this event starts the parameterization
        routerEvents$.next(new ResolveEnd(1, url, url, routerState as any));

        expect(transaction.setName).toHaveBeenCalledWith(result, 'route');
      });

      it('does not change the transaction name if the source is something other than `url`', () => {
        instrumentAngularRouting(customStartTransaction, false, true);

        const url = '/user/12345/test';

        routerEvents$.next(new NavigationStart(0, url));

        expect(customStartTransaction).toHaveBeenCalledWith({
          name: url,
          op: 'navigation',
          metadata: { source: 'url' },
        });

        // Simulate that this transaction has a custom name:
        transaction.metadata.source = 'custom';

        // this event starts the parameterization
        routerEvents$.next(
          new ResolveEnd(1, url, url, {
            root: { firstChild: { routeConfig: { path: 'org/:orgId/projects/:projId/events/:eventId' } } },
          } as any),
        );

        expect(transaction.setName).toHaveBeenCalledTimes(0);
        expect(transaction.name).toEqual(url);
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
});

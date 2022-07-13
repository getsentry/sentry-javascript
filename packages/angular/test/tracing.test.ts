import { Event, NavigationStart, ResolveEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { instrumentAngularRouting, TraceService } from '../src/index';

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

      let transaction: any;
      let customStartTransaction: any;
      beforeEach(() => {
        transaction = {
          setName: jest.fn(name => (transaction.name = name)),
          setMetadata: jest.fn(metadata => (transaction.metadata = metadata)),
        };

        customStartTransaction = jest.fn((ctx: any) => {
          transaction.name = ctx.name;
          transaction.op = ctx.op;
          transaction.metadata = ctx.metadata;
          return transaction;
        });
      });

      it.each([
        ['does not alter static routes', '/books/', {}, '/books/'],
        ['parameterizes number IDs in the URL', '/books/1/details', { bookId: '1' }, '/books/:bookId/details'],
        [
          'parameterizes string IDs in the URL',
          '/books/asd123/details',
          { bookId: 'asd123' },
          '/books/:bookId/details',
        ],
        [
          'parameterizes UUID4 IDs in the URL',
          '/books/04bc6846-4a1e-4af5-984a-003258f33e31/details',
          { bookId: '04bc6846-4a1e-4af5-984a-003258f33e31' },
          '/books/:bookId/details',
        ],
        [
          'parameterizes multiple IDs in the URL',
          '/org/sentry/projects/1234/events/04bc6846-4a1e-4af5-984a-003258f33e31',
          { orgId: 'sentry', projId: '1234', eventId: '04bc6846-4a1e-4af5-984a-003258f33e31' },
          '/org/:orgId/projects/:projId/events/:eventId',
        ],
      ])('%s and sets the source to `route`', (_, url, params, result) => {
        instrumentAngularRouting(customStartTransaction);

        // this event starts the transaction
        routerEvents$.next(new NavigationStart(0, url));

        expect(customStartTransaction).toHaveBeenCalledWith({
          name: url,
          op: 'navigation',
          metadata: { source: 'url' },
        });

        // this event starts the parameterization
        routerEvents$.next(new ResolveEnd(1, url, url, { root: { params, children: [] } } as any));

        expect(transaction.setName).toHaveBeenCalledWith(result);
        expect(transaction.setMetadata).toHaveBeenCalledWith({ source: 'route' });
      });

      it('does not change the transaction name if the source is something other than `url`', () => {
        instrumentAngularRouting(customStartTransaction);

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
        routerEvents$.next(new ResolveEnd(1, url, url, { root: { params: { userId: '12345' }, children: [] } } as any));

        expect(transaction.setName).toHaveBeenCalledTimes(0);
        expect(transaction.setMetadata).toHaveBeenCalledTimes(0);
        expect(transaction.name).toEqual(url);
      });
    });
  });
});

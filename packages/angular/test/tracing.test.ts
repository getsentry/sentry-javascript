import { ActivatedRouteSnapshot, ActivationEnd, Event, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { instrumentAngularRouting, TraceService } from '../src/index';

type MockedRouter = Router & {
  setMockParams: (params: any) => void;
  setMockUrl: (url: string) => void;
  mockUrl: string;
};

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
    const mockedRouter = {
      events: routerEvents$,
      routerState: {
        snapshot: {
          root: {
            params: {},
            children: [],
          },
        },
      },

      // router.url is readonly originally.Using a getter lets us return a previously changed URL
      get url() {
        return mockedRouter.mockUrl;
      },

      setMockParams: (params: any) => {
        mockedRouter.routerState.snapshot.root.params = params;
      },

      setMockUrl: (url: string) => {
        mockedRouter.mockUrl = url;
      },
    } as unknown as MockedRouter;

    beforeEach(() => {
      instrumentAngularRouting(startTransaction);
      jest.resetAllMocks();
      traceService = new TraceService(mockedRouter);
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
      it.each([
        ['does not parameterize static routes', '/books/', {}, '/books/'],
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
        const transaction: any = {
          setName: jest.fn(name => (transaction.name = name)),
          setMetadata: jest.fn(metadata => (transaction.metadata = metadata)),
        };

        const customStartTransaction = jest.fn((ctx: any) => {
          transaction.name = ctx.name;
          transaction.op = ctx.op;
          transaction.metadata = ctx.metadata;
          return transaction;
        });

        instrumentAngularRouting(customStartTransaction);

        mockedRouter.setMockParams(params);
        mockedRouter.setMockUrl(url);

        // this event starts the transaction
        routerEvents$.next(new NavigationStart(0, url));

        expect(customStartTransaction).toHaveBeenCalledWith({
          name: url,
          op: 'navigation',
          metadata: { source: 'url' },
        });

        // this event starts the parameterization
        routerEvents$.next(new ActivationEnd(new ActivatedRouteSnapshot()));

        expect(transaction.setName).toHaveBeenCalledWith(result);
        expect(transaction.setMetadata).toHaveBeenCalledWith({ source: 'route' });
      });
    });
  });
});

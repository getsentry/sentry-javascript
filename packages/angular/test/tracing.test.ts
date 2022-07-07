import { instrumentAngularRouting, TraceService } from '../src/index';

import { NavigationStart, Router, RouterEvent } from '@angular/router';
import { Subject } from 'rxjs';

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
    let routerEvents$: Subject<RouterEvent> = new Subject();

    beforeAll(() => instrumentAngularRouting(startTransaction));
    beforeEach(() => {
      jest.resetAllMocks();

      traceService = new TraceService({
        events: routerEvents$,
      } as unknown as Router);
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
  });
});

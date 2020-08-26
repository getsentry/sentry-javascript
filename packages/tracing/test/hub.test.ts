import { BrowserClient } from '@sentry/browser';
import * as hubModuleRaw from '@sentry/hub'; // for mocking
import { getMainCarrier, Hub } from '@sentry/hub';
import { NodeClient } from '@sentry/node';
import * as utilsModule from '@sentry/utils'; // for mocking
import { getGlobalObject, isNodeEnv, logger } from '@sentry/utils';
import * as nodeHttpModule from 'http';

import { addExtensionMethods } from '../src/hubextensions';

// Do this once so that we'll be able to spy on hub methods later. If this isn't done, it results in "TypeError: Cannot
// set property <methodYouWantToSpyOn> of #<Object> which has only a getter." This just converts the module object
// (which has no setters) to a regular object (with regular properties which can be gotten or set). See
// https://stackoverflow.com/a/53307822/.

// (This doesn't affect the utils module because it uses `export * from './myModule' syntax rather than `export
// {<individually named methods>} from './myModule'` syntax in its index.ts. Only *named* exports seem to trigger the
// problem.)
const hubModule = { ...hubModuleRaw}

addExtensionMethods();

describe('Hub', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'warn');
    jest.spyOn(logger, 'log');
    jest.spyOn(utilsModule, 'isNodeEnv');

    // NB: Upon refactoring, this spy was no longer needed. Leaving it in as an excuse to leave in the note above, so
    // that it can save future folks the headache.
    jest.spyOn(hubModule, 'getActiveDomain');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('getTransaction()', () => {

    it('should find a transaction which has been set on the scope', () => {
      const hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }));
      const transaction = hub.startTransaction({ name: 'dogpark' });
      hub.configureScope(scope => {
        scope.setSpan(transaction);
      });

      expect(hub.getScope()?.getTransaction()).toBe(transaction)

    });

    it("should not find an open transaction if it's not on the scope", () => {
      const hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }));
      hub.startTransaction({ name: 'dogpark' });

      expect(hub.getScope()?.getTransaction()).toBeUndefined()
    });
  }); // end describe('getTransaction()')

  describe('transaction sampling', () => {
    describe('options', () => {

      it("should call tracesSampler if it's defined", () => {
        const tracesSampler = jest.fn();
        const hub = new Hub(new BrowserClient({ tracesSampler }));
        hub.startTransaction({ name: 'dogpark' });

        expect(tracesSampler).toHaveBeenCalled();
      });

      it('should prefer tracesSampler to tracesSampleRate', () => {
        const tracesSampler = jest.fn();
        const hub = new Hub(new BrowserClient({ tracesSampleRate: 1, tracesSampler: tracesSampler }));
        hub.startTransaction({ name: 'dogpark' });

        expect(tracesSampler).toHaveBeenCalled();
      });

    }); // end describe('options')

    describe('default sample context', () => {

      it('should extract request data for default sampling context when in node', () => {
        // make sure we look like we're in node
        (isNodeEnv as jest.Mock).mockReturnValue(true);

        // pre-normalization request object
        const mockRequestObject = ({
          headers: { ears: 'furry', nose: 'wet', tongue: 'panting', cookie: 'favorite=zukes' },
          method: 'wagging',
          protocol: 'mutualsniffing',
          hostname: 'the.dog.park',
          originalUrl: '/by/the/trees/?chase=me&please=thankyou',
        } as unknown) as nodeHttpModule.IncomingMessage;

        // The "as unknown as nodeHttpModule.IncomingMessage" casting above keeps TS happy, but doesn't actually mean that
        // mockRequestObject IS an instance of our desired class. Fix that so that when we search for it by type, we
        // actually find it.
        Object.setPrototypeOf(mockRequestObject, nodeHttpModule.IncomingMessage.prototype);

        // in production, the domain will have at minimum the request and the response, so make a response object to prove
        // that our code identifying the request in domain.members works
        const mockResponseObject = new nodeHttpModule.ServerResponse(mockRequestObject);

        // normally the node request handler does this, but that's not part of this test
        (getMainCarrier().__SENTRY__!.extensions as any).domain = {
          active: { members: [mockRequestObject, mockResponseObject] },
        };

        const tracesSampler = jest.fn();
        const hub = new Hub(new NodeClient({ tracesSampler }));
        hub.startTransaction({ name: 'dogpark' });

        // post-normalization request object
        expect(tracesSampler).toHaveBeenCalledWith(expect.objectContaining({
          request: {
            headers: { ears: 'furry', nose: 'wet', tongue: 'panting', cookie: 'favorite=zukes' },
            method: 'wagging',
            url: 'http://the.dog.park/by/the/trees/?chase=me&please=thankyou',
            cookies: { favorite: 'zukes' },
            query_string: 'chase=me&please=thankyou',
          },
        }));
      });

      it('should extract window.location/self.location for default sampling context when in browser/service worker', () => {
        // make sure we look like we're in the browser
        (isNodeEnv as jest.Mock).mockReturnValue(false);

        const dogParkLocation = {
          hash: '#next-to-the-fountain',
          host: 'the.dog.park',
          hostname: 'the.dog.park',
          href: 'mutualsniffing://the.dog.park/by/the/trees/?chase=me&please=thankyou#next-to-the-fountain',
          origin: "'mutualsniffing://the.dog.park",
          pathname: '/by/the/trees/',
          port: '',
          protocol: 'mutualsniffing:',
          search: '?chase=me&please=thankyou',
        };

        getGlobalObject().location = dogParkLocation as any;

        const tracesSampler = jest.fn();
        const hub = new Hub(new BrowserClient({ tracesSampler }));
        hub.startTransaction({ name: 'dogpark' });

        expect(tracesSampler).toHaveBeenCalledWith(expect.objectContaining({ location: dogParkLocation }));
      });
    }); // end describe('defaultSampleContext')

    describe('while sampling', () => {

      it('should not sample transactions when tracing is disabled', () => {
        // neither tracesSampleRate nor tracesSampler is defined -> tracing disabled
        const hub = new Hub(new BrowserClient({}));
        const transaction = hub.startTransaction({ name: 'dogpark' });

        expect(transaction.sampled).toBe(false);
      });

      it('should not sample transactions when tracesSampleRate is 0', () => {
        const hub = new Hub(new BrowserClient({ tracesSampleRate: 0 }));
        const transaction = hub.startTransaction({ name: 'dogpark' });

        expect(transaction.sampled).toBe(false);
      });

      it('should sample transactions when tracesSampleRate is 1', () => {
        const hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }));
        const transaction = hub.startTransaction({ name: 'dogpark' });

        expect(transaction.sampled).toBe(true);
      });

    it("should reject tracesSampleRates which aren't numbers", () => {
      const hub = new Hub(new BrowserClient({ tracesSampleRate: 'dogs!' as any }));
      hub.startTransaction({ name: 'dogpark' });

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sample rate must be a number'));
    });

    it('should reject tracesSampleRates less than 0', () => {
      const hub = new Hub(new BrowserClient({ tracesSampleRate: -26 }));
      hub.startTransaction({ name: 'dogpark' });

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sample rate must be between 0 and 1'));
    });

    it('should reject tracesSampleRates greater than 1', () => {
      const hub = new Hub(new BrowserClient({ tracesSampleRate: 26 }));
      hub.startTransaction({ name: 'dogpark' });

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sample rate must be between 0 and 1'));
    });

    it("should reject tracesSampler return values which aren't numbers", () => {
      const tracesSampler = jest.fn().mockReturnValue("dogs!")
      const hub = new Hub(new BrowserClient({ tracesSampler }));
      hub.startTransaction({ name: 'dogpark' });

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sample rate must be a number'));
    });

    it('should reject tracesSampler return values less than 0', () => {
      const tracesSampler = jest.fn().mockReturnValue(-12)
      const hub = new Hub(new BrowserClient({ tracesSampler }));
      hub.startTransaction({ name: 'dogpark' });

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sample rate must be between 0 and 1'));
    });

    it('should reject tracesSampler return values greater than 1', () => {
      const tracesSampler = jest.fn().mockReturnValue(31)
      const hub = new Hub(new BrowserClient({ tracesSampler }));
      hub.startTransaction({ name: 'dogpark' });

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sample rate must be between 0 and 1'));
    });
  }); // end describe('while sampling')

    it('should propagate sampling decision to child spans', () => {
      const hub = new Hub(new BrowserClient({ tracesSampleRate: 0 }));
      const transaction = hub.startTransaction({ name: 'dogpark' });
      const child = transaction.startChild({ op: 'test' });

      expect(child.sampled).toBe(false);
    });

    it('should drop transactions with sampled = false', () => {
      const client = new BrowserClient({ tracesSampleRate: 0 })
      jest.spyOn(client, 'captureEvent')

      const hub = new Hub(client);
      const transaction = hub.startTransaction({ name: 'dogpark' });

      jest.spyOn(transaction, 'finish')
      transaction.finish()

      expect(transaction.sampled).toBe(false);
      expect(transaction.finish).toReturnWith(undefined);
      expect(client.captureEvent).not.toBeCalled()
    });
  }); // end describe('transaction sampling')
}); // end describe('Hub')

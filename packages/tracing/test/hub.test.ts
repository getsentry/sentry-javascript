/* eslint-disable @typescript-eslint/unbound-method */
import { BrowserClient } from '@sentry/browser';
import { setupBrowserTransport } from '@sentry/browser/src/transports';
import { getDefaultBrowserClientOptions } from '@sentry/browser/test/unit/helper/browser-client-options';
import { Hub, makeMain } from '@sentry/hub';
import * as utilsModule from '@sentry/utils'; // for mocking
import { logger } from '@sentry/utils';

import { BrowserTracing } from '../src/browser/browsertracing';
import { addExtensionMethods } from '../src/hubextensions';
import { Transaction } from '../src/transaction';
import { extractTraceparentData, TRACEPARENT_REGEXP } from '../src/utils';
import { addDOMPropertiesToGlobal, getSymbolObjectKeyByName, testOnlyIfNodeVersionAtLeast } from './testutils';

addExtensionMethods();

const mathRandom = jest.spyOn(Math, 'random');
jest.spyOn(Transaction.prototype, 'setMetadata');
jest.spyOn(logger, 'warn');
jest.spyOn(logger, 'log');
jest.spyOn(utilsModule, 'isNodeEnv');

// we have to add things into the real global object (rather than mocking the return value of getGlobalObject) because
// there are modules which call getGlobalObject as they load, which is seemingly too early for jest to intervene
addDOMPropertiesToGlobal(['XMLHttpRequest', 'Event', 'location', 'document']);

describe('Hub', () => {
  afterEach(() => {
    jest.clearAllMocks();
    // Reset global carrier to the initial state
    const hub = new Hub();
    makeMain(hub);
  });

  describe('getTransaction()', () => {
    it('should find a transaction which has been set on the scope if sampled = true', () => {
      const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
      const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
      makeMain(hub);
      const transaction = hub.startTransaction({ name: 'dogpark' });
      transaction.sampled = true;

      hub.configureScope(scope => {
        scope.setSpan(transaction);
      });

      expect(hub.getScope()?.getTransaction()).toBe(transaction);
    });

    it('should find a transaction which has been set on the scope if sampled = false', () => {
      const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
      const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
      makeMain(hub);
      const transaction = hub.startTransaction({ name: 'dogpark', sampled: false });

      hub.configureScope(scope => {
        scope.setSpan(transaction);
      });

      expect(hub.getScope()?.getTransaction()).toBe(transaction);
    });

    it("should not find an open transaction if it's not on the scope", () => {
      const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
      const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
      makeMain(hub);
      hub.startTransaction({ name: 'dogpark' });

      expect(hub.getScope()?.getTransaction()).toBeUndefined();
    });
  });

  describe('transaction sampling', () => {
    describe('default sample context', () => {
      it('should add transaction context data to default sample context', () => {
        const tracesSampler = jest.fn();
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);

        const transactionContext = {
          name: 'dogpark',
          parentSpanId: '12312012',
          parentSampled: true,
        };

        hub.startTransaction(transactionContext);

        expect(tracesSampler).toHaveBeenLastCalledWith(expect.objectContaining({ transactionContext }));
      });

      it("should add parent's sampling decision to default sample context", () => {
        const tracesSampler = jest.fn();
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        const parentSamplingDecsion = false;

        hub.startTransaction({
          name: 'dogpark',
          parentSpanId: '12312012',
          parentSampled: parentSamplingDecsion,
        });

        expect(tracesSampler).toHaveBeenLastCalledWith(
          expect.objectContaining({ parentSampled: parentSamplingDecsion }),
        );
      });
    });

    describe('sample()', () => {
      it('should set sampled = false when tracing is disabled', () => {
        const options = getDefaultBrowserClientOptions({});
        // neither tracesSampleRate nor tracesSampler is defined -> tracing disabled
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        const transaction = hub.startTransaction({ name: 'dogpark' });

        expect(transaction.sampled).toBe(false);
      });

      it('should set sampled = false if tracesSampleRate is 0', () => {
        const options = getDefaultBrowserClientOptions({ tracesSampleRate: 0 });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        const transaction = hub.startTransaction({ name: 'dogpark' });

        expect(transaction.sampled).toBe(false);
      });

      it('should set sampled = true if tracesSampleRate is 1', () => {
        const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        const transaction = hub.startTransaction({ name: 'dogpark' });

        expect(transaction.sampled).toBe(true);
      });

      it('should set sampled = true if tracesSampleRate is 1 (without global hub)', () => {
        const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        const transaction = hub.startTransaction({ name: 'dogpark' });

        expect(transaction.sampled).toBe(true);
      });

      it("should call tracesSampler if it's defined", () => {
        const tracesSampler = jest.fn();
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        hub.startTransaction({ name: 'dogpark' });

        expect(tracesSampler).toHaveBeenCalled();
      });

      it('should set sampled = false if tracesSampler returns 0', () => {
        const tracesSampler = jest.fn().mockReturnValue(0);
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        const transaction = hub.startTransaction({ name: 'dogpark' });

        expect(tracesSampler).toHaveBeenCalled();
        expect(transaction.sampled).toBe(false);
      });

      it('should set sampled = true if tracesSampler returns 1', () => {
        const tracesSampler = jest.fn().mockReturnValue(1);
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        const transaction = hub.startTransaction({ name: 'dogpark' });

        expect(tracesSampler).toHaveBeenCalled();
        expect(transaction.sampled).toBe(true);
      });

      it('should set sampled = true if tracesSampler returns 1 (without global hub)', () => {
        const tracesSampler = jest.fn().mockReturnValue(1);
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        const transaction = hub.startTransaction({ name: 'dogpark' });

        expect(tracesSampler).toHaveBeenCalled();
        expect(transaction.sampled).toBe(true);
      });

      it('should not try to override explicitly set positive sampling decision', () => {
        // so that the decision otherwise would be false
        const tracesSampler = jest.fn().mockReturnValue(0);
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        const transaction = hub.startTransaction({ name: 'dogpark', sampled: true });

        expect(transaction.sampled).toBe(true);
      });

      it('should not try to override explicitly set negative sampling decision', () => {
        // so that the decision otherwise would be true
        const tracesSampler = jest.fn().mockReturnValue(1);
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        const transaction = hub.startTransaction({ name: 'dogpark', sampled: false });

        expect(transaction.sampled).toBe(false);
      });

      it('should prefer tracesSampler to tracesSampleRate', () => {
        // make the two options do opposite things to prove precedence
        const tracesSampler = jest.fn().mockReturnValue(true);
        const options = getDefaultBrowserClientOptions({ tracesSampleRate: 0, tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        const transaction = hub.startTransaction({ name: 'dogpark' });

        expect(tracesSampler).toHaveBeenCalled();
        expect(transaction.sampled).toBe(true);
      });

      it('should tolerate tracesSampler returning a boolean', () => {
        const tracesSampler = jest.fn().mockReturnValue(true);
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        const transaction = hub.startTransaction({ name: 'dogpark' });

        expect(tracesSampler).toHaveBeenCalled();
        expect(transaction.sampled).toBe(true);
      });

      it('should record sampling method when sampling decision is explicitly set', () => {
        const tracesSampler = jest.fn().mockReturnValue(0.1121);
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        hub.startTransaction({ name: 'dogpark', sampled: true });

        expect(Transaction.prototype.setMetadata).toHaveBeenCalledWith({
          transactionSampling: { method: 'explicitly_set' },
        });
      });

      it('should record sampling method and rate when sampling decision comes from tracesSampler', () => {
        const tracesSampler = jest.fn().mockReturnValue(0.1121);
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        hub.startTransaction({ name: 'dogpark' });

        expect(Transaction.prototype.setMetadata).toHaveBeenCalledWith({
          transactionSampling: { method: 'client_sampler', rate: 0.1121 },
        });
      });

      it('should record sampling method when sampling decision is inherited', () => {
        const options = getDefaultBrowserClientOptions({ tracesSampleRate: 0.1121 });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        hub.startTransaction({ name: 'dogpark', parentSampled: true });

        expect(Transaction.prototype.setMetadata).toHaveBeenCalledWith({
          transactionSampling: { method: 'inheritance' },
        });
      });

      it('should record sampling method and rate when sampling decision comes from traceSampleRate', () => {
        const options = getDefaultBrowserClientOptions({ tracesSampleRate: 0.1121 });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        hub.startTransaction({ name: 'dogpark' });

        expect(Transaction.prototype.setMetadata).toHaveBeenCalledWith({
          transactionSampling: { method: 'client_rate', rate: 0.1121 },
        });
      });
    });

    describe('isValidSampleRate()', () => {
      it("should reject tracesSampleRates which aren't numbers or booleans", () => {
        const options = getDefaultBrowserClientOptions({ tracesSampleRate: 'dogs!' as any });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        hub.startTransaction({ name: 'dogpark' });

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sample rate must be a boolean or a number'));
      });

      it('should reject tracesSampleRates which are NaN', () => {
        const options = getDefaultBrowserClientOptions({ tracesSampleRate: 'dogs!' as any });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        hub.startTransaction({ name: 'dogpark' });

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sample rate must be a boolean or a number'));
      });

      // the rate might be a boolean, but for our purposes, false is equivalent to 0 and true is equivalent to 1
      it('should reject tracesSampleRates less than 0', () => {
        const options = getDefaultBrowserClientOptions({ tracesSampleRate: -26 });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        hub.startTransaction({ name: 'dogpark' });

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sample rate must be between 0 and 1'));
      });

      // the rate might be a boolean, but for our purposes, false is equivalent to 0 and true is equivalent to 1
      it('should reject tracesSampleRates greater than 1', () => {
        const options = getDefaultBrowserClientOptions({ tracesSampleRate: 26 });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        hub.startTransaction({ name: 'dogpark' });

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sample rate must be between 0 and 1'));
      });

      it("should reject tracesSampler return values which aren't numbers or booleans", () => {
        const tracesSampler = jest.fn().mockReturnValue('dogs!');
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        hub.startTransaction({ name: 'dogpark' });

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sample rate must be a boolean or a number'));
      });

      it('should reject tracesSampler return values which are NaN', () => {
        const tracesSampler = jest.fn().mockReturnValue(NaN);
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        hub.startTransaction({ name: 'dogpark' });

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sample rate must be a boolean or a number'));
      });

      // the rate might be a boolean, but for our purposes, false is equivalent to 0 and true is equivalent to 1
      it('should reject tracesSampler return values less than 0', () => {
        const tracesSampler = jest.fn().mockReturnValue(-12);
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        hub.startTransaction({ name: 'dogpark' });

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sample rate must be between 0 and 1'));
      });

      // the rate might be a boolean, but for our purposes, false is equivalent to 0 and true is equivalent to 1
      it('should reject tracesSampler return values greater than 1', () => {
        const tracesSampler = jest.fn().mockReturnValue(31);
        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        hub.startTransaction({ name: 'dogpark' });

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sample rate must be between 0 and 1'));
      });
    });

    it('should drop transactions with sampled = false', () => {
      const options = getDefaultBrowserClientOptions({ tracesSampleRate: 0 });
      const client = new BrowserClient(options, setupBrowserTransport(options).transport);
      jest.spyOn(client, 'captureEvent');

      const hub = new Hub(client);
      makeMain(hub);
      const transaction = hub.startTransaction({ name: 'dogpark' });

      jest.spyOn(transaction, 'finish');
      transaction.finish();

      expect(transaction.sampled).toBe(false);
      expect(transaction.finish).toReturnWith(undefined);
      expect(client.captureEvent).not.toBeCalled();
    });

    describe('sampling inheritance', () => {
      it('should propagate sampling decision to child spans', () => {
        const options = getDefaultBrowserClientOptions({ tracesSampleRate: Math.random() });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        const transaction = hub.startTransaction({ name: 'dogpark' });
        const child = transaction.startChild({ op: 'ball.chase' });

        expect(child.sampled).toBe(transaction.sampled);
      });

      // TODO the way we dig out the headers to test them doesn't work on Node < 10
      testOnlyIfNodeVersionAtLeast(10)(
        'should propagate positive sampling decision to child transactions in XHR header',
        async () => {
          const options = getDefaultBrowserClientOptions({
            dsn: 'https://1231@dogs.are.great/1121',
            tracesSampleRate: 1,
            integrations: [new BrowserTracing()],
          });
          const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
          makeMain(hub);

          const transaction = hub.startTransaction({ name: 'dogpark' });
          hub.configureScope(scope => {
            scope.setSpan(transaction);
          });

          const request = new XMLHttpRequest();
          await new Promise(resolve => {
            request.timeout = 1;
            request.onloadend = request.ontimeout = resolve;
            request.open('GET', '/chase-partners');
            request.send('');
          });

          // this looks weird, it's true, but it's really just `request.impl.flag.requestHeaders` - it's just that the
          // `impl` key is a symbol rather than a string, and therefore needs to be referred to by reference rather than
          // value
          const headers = (request as any)[getSymbolObjectKeyByName(request, 'impl') as symbol].flag.requestHeaders;

          // check that sentry-trace header is added to request
          expect(headers).toEqual(
            expect.objectContaining({ 'sentry-trace': expect.stringMatching(TRACEPARENT_REGEXP) }),
          );

          // check that sampling decision is passed down correctly
          expect(transaction.sampled).toBe(true);
          expect(extractTraceparentData(headers['sentry-trace'])!.parentSampled).toBe(true);
        },
      );

      // TODO the way we dig out the headers to test them doesn't work on Node < 10
      testOnlyIfNodeVersionAtLeast(10)(
        'should propagate negative sampling decision to child transactions in XHR header',
        async () => {
          const options = getDefaultBrowserClientOptions({
            dsn: 'https://1231@dogs.are.great/1121',
            tracesSampleRate: 1,
            integrations: [new BrowserTracing()],
          });
          const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
          makeMain(hub);

          const transaction = hub.startTransaction({ name: 'dogpark', sampled: false });
          hub.configureScope(scope => {
            scope.setSpan(transaction);
          });

          const request = new XMLHttpRequest();
          await new Promise(resolve => {
            request.timeout = 1;
            request.onloadend = request.ontimeout = resolve;
            request.open('GET', '/chase-partners');
            request.send('');
          });

          // this looks weird, it's true, but it's really just `request.impl.flag.requestHeaders` - it's just that the
          // `impl` key is a symbol rather than a string, and therefore needs to be referred to by reference rather than
          // value
          const headers = (request as any)[getSymbolObjectKeyByName(request, 'impl') as symbol].flag.requestHeaders;

          // check that sentry-trace header is added to request
          expect(headers).toEqual(
            expect.objectContaining({ 'sentry-trace': expect.stringMatching(TRACEPARENT_REGEXP) }),
          );

          // check that sampling decision is passed down correctly
          expect(transaction.sampled).toBe(false);
          expect(extractTraceparentData(headers['sentry-trace'])!.parentSampled).toBe(false);
        },
      );

      it('should propagate positive sampling decision to child transactions in fetch header', () => {
        // TODO
      });

      it('should propagate negative sampling decision to child transactions in fetch header', () => {
        // TODO
      });

      it("should inherit parent's positive sampling decision if tracesSampler is undefined", () => {
        // we know that without inheritance  we'll get sampled = false (since our "random" number won't be below the
        // sample rate), so make parent's decision the opposite to prove that inheritance takes precedence over
        // tracesSampleRate
        mathRandom.mockReturnValueOnce(1);
        const options = getDefaultBrowserClientOptions({ tracesSampleRate: 0.5 });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        const parentSamplingDecsion = true;

        const transaction = hub.startTransaction({
          name: 'dogpark',
          parentSpanId: '12312012',
          parentSampled: parentSamplingDecsion,
        });

        expect(transaction.sampled).toBe(parentSamplingDecsion);
      });

      it("should inherit parent's negative sampling decision if tracesSampler is undefined", () => {
        const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
        // tracesSampleRate = 1 means every transaction should end up with sampled = true, so make parent's decision the
        // opposite to prove that inheritance takes precedence over tracesSampleRate
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);
        const parentSamplingDecsion = false;

        const transaction = hub.startTransaction({
          name: 'dogpark',
          parentSpanId: '12312012',
          parentSampled: parentSamplingDecsion,
        });

        expect(transaction.sampled).toBe(parentSamplingDecsion);
      });

      it("should ignore parent's positive sampling decision when tracesSampler is defined", () => {
        // this tracesSampler causes every transaction to end up with sampled = true, so make parent's decision the
        // opposite to prove that tracesSampler takes precedence over inheritance
        const tracesSampler = () => true;
        const parentSamplingDecsion = false;

        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);

        const transaction = hub.startTransaction({
          name: 'dogpark',
          parentSpanId: '12312012',
          parentSampled: parentSamplingDecsion,
        });

        expect(transaction.sampled).not.toBe(parentSamplingDecsion);
      });

      it("should ignore parent's negative sampling decision when tracesSampler is defined", () => {
        // this tracesSampler causes every transaction to end up with sampled = false, so make parent's decision the
        // opposite to prove that tracesSampler takes precedence over inheritance
        const tracesSampler = () => false;
        const parentSamplingDecsion = true;

        const options = getDefaultBrowserClientOptions({ tracesSampler });
        const hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        makeMain(hub);

        const transaction = hub.startTransaction({
          name: 'dogpark',
          parentSpanId: '12312012',
          parentSampled: parentSamplingDecsion,
        });

        expect(transaction.sampled).not.toBe(parentSamplingDecsion);
      });
    });
  });
});

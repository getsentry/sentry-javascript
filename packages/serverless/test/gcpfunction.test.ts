import {
  CloudEventFunction,
  CloudEventFunctionWithCallback,
  EventFunction,
  EventFunctionWithCallback,
  HttpFunction,
} from '@google-cloud/functions-framework/build/src/functions';
import { Event } from '@sentry/types';
import * as domain from 'domain';

import * as Sentry from '../src';
import { Request, Response, wrapCloudEventFunction, wrapEventFunction, wrapHttpFunction } from '../src/gcpfunction';

/**
 * Why @ts-ignore some Sentry.X calls
 *
 * A hack-ish way to contain everything related to mocks in the same __mocks__ file.
 * Thanks to this, we don't have to do more magic than necessary. Just add and export desired method and assert on it.
 */

describe('GCPFunction', () => {
  afterEach(() => {
    // @ts-ignore see "Why @ts-ignore" note
    Sentry.resetMocks();
  });

  async function handleHttp(fn: HttpFunction): Promise<void> {
    return new Promise((resolve, _reject) => {
      const d = domain.create();
      const req = {
        method: 'GET',
        host: 'hostname',
        cookies: {},
        query: {},
        url: '/path',
        headers: {},
      } as Request;
      const res = { end: resolve } as Response;
      d.on('error', () => res.end());
      d.run(() => process.nextTick(fn, req, res));
    });
  }

  function handleEvent(fn: EventFunctionWithCallback): Promise<any> {
    return new Promise((resolve, reject) => {
      const d = domain.create();
      // d.on('error', () => res.end());
      const context = {
        eventType: 'event.type',
        resource: 'some.resource',
      };
      d.on('error', reject);
      d.run(() =>
        process.nextTick(fn, {}, context, (err: any, result: any) => {
          if (err != null || err != undefined) {
            reject(err);
          } else {
            resolve(result);
          }
        }),
      );
    });
  }

  function handleCloudEvent(fn: CloudEventFunctionWithCallback): Promise<any> {
    return new Promise((resolve, reject) => {
      const d = domain.create();
      // d.on('error', () => res.end());
      const context = {
        type: 'event.type',
      };
      d.on('error', reject);
      d.run(() =>
        process.nextTick(fn, context, (err: any, result: any) => {
          if (err != null || err != undefined) {
            reject(err);
          } else {
            resolve(result);
          }
        }),
      );
    });
  }

  describe('wrapHttpFunction() options', () => {
    test('flushTimeout', async () => {
      expect.assertions(1);

      const handler: HttpFunction = (_, res) => {
        res.end();
      };
      const wrappedHandler = wrapHttpFunction(handler, { flushTimeout: 1337 });

      await handleHttp(wrappedHandler);
      expect(Sentry.flush).toBeCalledWith(1337);
    });
  });

  describe('wrapHttpFunction()', () => {
    test('successful execution', async () => {
      expect.assertions(5);

      const handler: HttpFunction = (_req, res) => {
        res.statusCode = 200;
        res.end();
      };
      const wrappedHandler = wrapHttpFunction(handler);
      await handleHttp(wrappedHandler);
      expect(Sentry.startTransaction).toBeCalledWith({ name: 'GET /path', op: 'gcp.function.http' });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeParentScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.setHttpStatus).toBeCalledWith(200);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalledWith(2000);
    });

    test('capture error', async () => {
      expect.assertions(5);

      const error = new Error('wat');
      const handler: HttpFunction = (_req, _res) => {
        throw error;
      };
      const wrappedHandler = wrapHttpFunction(handler);
      await handleHttp(wrappedHandler);
      expect(Sentry.startTransaction).toBeCalledWith({ name: 'GET /path', op: 'gcp.function.http' });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeParentScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      expect(Sentry.captureException).toBeCalledWith(error);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalled();
    });
  });

  describe('wrapEventFunction() without callback', () => {
    test('successful execution', async () => {
      expect.assertions(5);

      const func: EventFunction = (_data, _context) => {
        return 42;
      };
      const wrappedHandler = wrapEventFunction(func);
      await expect(handleEvent(wrappedHandler)).resolves.toBe(42);
      expect(Sentry.startTransaction).toBeCalledWith({ name: 'event.type', op: 'gcp.function.event' });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeParentScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalledWith(2000);
    });

    test('capture error', async () => {
      expect.assertions(6);

      const error = new Error('wat');
      const handler: EventFunction = (_data, _context) => {
        throw error;
      };
      const wrappedHandler = wrapEventFunction(handler);
      await expect(handleEvent(wrappedHandler)).rejects.toThrowError(error);
      expect(Sentry.startTransaction).toBeCalledWith({ name: 'event.type', op: 'gcp.function.event' });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeParentScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      expect(Sentry.captureException).toBeCalledWith(error);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalled();
    });
  });

  describe('wrapEventFunction() with callback', () => {
    test('successful execution', async () => {
      expect.assertions(5);

      const func: EventFunctionWithCallback = (_data, _context, cb) => {
        cb(null, 42);
      };
      const wrappedHandler = wrapEventFunction(func);
      await expect(handleEvent(wrappedHandler)).resolves.toBe(42);
      expect(Sentry.startTransaction).toBeCalledWith({ name: 'event.type', op: 'gcp.function.event' });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeParentScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalledWith(2000);
    });

    test('capture error', async () => {
      expect.assertions(6);

      const error = new Error('wat');
      const handler: EventFunctionWithCallback = (_data, _context, cb) => {
        cb(error);
      };
      const wrappedHandler = wrapEventFunction(handler);
      await expect(handleEvent(wrappedHandler)).rejects.toThrowError(error);
      expect(Sentry.startTransaction).toBeCalledWith({ name: 'event.type', op: 'gcp.function.event' });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeParentScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      expect(Sentry.captureException).toBeCalledWith(error);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalled();
    });

    test('capture exception', async () => {
      expect.assertions(4);

      const error = new Error('wat');
      const handler: EventFunctionWithCallback = (_data, _context, _cb) => {
        throw error;
      };
      const wrappedHandler = wrapEventFunction(handler);
      await expect(handleEvent(wrappedHandler)).rejects.toThrowError(error);
      expect(Sentry.startTransaction).toBeCalledWith({ name: 'event.type', op: 'gcp.function.event' });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeParentScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      expect(Sentry.captureException).toBeCalledWith(error);
    });
  });

  describe('wrapCloudEventFunction() without callback', () => {
    test('successful execution', async () => {
      expect.assertions(5);

      const func: CloudEventFunction = _context => {
        return 42;
      };
      const wrappedHandler = wrapCloudEventFunction(func);
      await expect(handleCloudEvent(wrappedHandler)).resolves.toBe(42);
      expect(Sentry.startTransaction).toBeCalledWith({ name: 'event.type', op: 'gcp.function.cloud_event' });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeParentScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalledWith(2000);
    });

    test('capture error', async () => {
      expect.assertions(6);

      const error = new Error('wat');
      const handler: CloudEventFunction = _context => {
        throw error;
      };
      const wrappedHandler = wrapCloudEventFunction(handler);
      await expect(handleCloudEvent(wrappedHandler)).rejects.toThrowError(error);
      expect(Sentry.startTransaction).toBeCalledWith({ name: 'event.type', op: 'gcp.function.cloud_event' });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeParentScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      expect(Sentry.captureException).toBeCalledWith(error);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalled();
    });
  });

  describe('wrapCloudEventFunction() with callback', () => {
    test('successful execution', async () => {
      expect.assertions(5);

      const func: CloudEventFunctionWithCallback = (_context, cb) => {
        cb(null, 42);
      };
      const wrappedHandler = wrapCloudEventFunction(func);
      await expect(handleCloudEvent(wrappedHandler)).resolves.toBe(42);
      expect(Sentry.startTransaction).toBeCalledWith({ name: 'event.type', op: 'gcp.function.cloud_event' });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeParentScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalledWith(2000);
    });

    test('capture error', async () => {
      expect.assertions(6);

      const error = new Error('wat');
      const handler: CloudEventFunctionWithCallback = (_context, cb) => {
        cb(error);
      };
      const wrappedHandler = wrapCloudEventFunction(handler);
      await expect(handleCloudEvent(wrappedHandler)).rejects.toThrowError(error);
      expect(Sentry.startTransaction).toBeCalledWith({ name: 'event.type', op: 'gcp.function.cloud_event' });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeParentScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      expect(Sentry.captureException).toBeCalledWith(error);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalled();
    });

    test('capture exception', async () => {
      expect.assertions(4);

      const error = new Error('wat');
      const handler: CloudEventFunctionWithCallback = (_context, _cb) => {
        throw error;
      };
      const wrappedHandler = wrapCloudEventFunction(handler);
      await expect(handleCloudEvent(wrappedHandler)).rejects.toThrowError(error);
      expect(Sentry.startTransaction).toBeCalledWith({ name: 'event.type', op: 'gcp.function.cloud_event' });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeParentScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      expect(Sentry.captureException).toBeCalledWith(error);
    });
  });

  test('enhance event with SDK info and correct mechanism value', async () => {
    expect.assertions(2);

    const error = new Error('wat');
    const handler: HttpFunction = () => {
      throw error;
    };
    const wrappedHandler = wrapHttpFunction(handler);

    const eventWithSomeData = {
      exception: {
        values: [{}],
      },
      sdk: {
        integrations: ['SomeIntegration'],
        packages: [
          {
            name: 'some:@random/package',
            version: '1337',
          },
        ],
      },
    };
    // @ts-ignore see "Why @ts-ignore" note
    Sentry.fakeScope.addEventProcessor.mockImplementationOnce(cb => cb(eventWithSomeData));
    await handleHttp(wrappedHandler);
    expect(eventWithSomeData).toEqual({
      exception: {
        values: [
          {
            mechanism: {
              handled: false,
            },
          },
        ],
      },
      sdk: {
        name: 'sentry.javascript.serverless',
        integrations: ['SomeIntegration', 'GCPFunction'],
        packages: [
          {
            name: 'some:@random/package',
            version: '1337',
          },
          {
            name: 'npm:@sentry/serverless',
            version: '6.6.6',
          },
        ],
        version: '6.6.6',
      },
    });

    const eventWithoutAnyData: Event = {
      exception: {
        values: [{}],
      },
    };
    // @ts-ignore see "Why @ts-ignore" note
    Sentry.fakeScope.addEventProcessor.mockImplementationOnce(cb => cb(eventWithoutAnyData));
    await handleHttp(wrappedHandler);
    expect(eventWithoutAnyData).toEqual({
      exception: {
        values: [
          {
            mechanism: {
              handled: false,
            },
          },
        ],
      },
      sdk: {
        name: 'sentry.javascript.serverless',
        integrations: ['GCPFunction'],
        packages: [
          {
            name: 'npm:@sentry/serverless',
            version: '6.6.6',
          },
        ],
        version: '6.6.6',
      },
    });
  });
});

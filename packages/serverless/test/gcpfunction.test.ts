import { Event } from '@sentry/types';
import * as domain from 'domain';

import * as Sentry from '../src';
import { wrapCloudEventFunction, wrapEventFunction, wrapHttpFunction } from '../src/gcpfunction';
import {
  CloudEventFunction,
  CloudEventFunctionWithCallback,
  EventFunction,
  EventFunctionWithCallback,
  HttpFunction,
  Request,
  Response,
} from '../src/gcpfunction/general';

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

  async function handleHttp(fn: HttpFunction, trace_headers: { [key: string]: string } | null = null): Promise<void> {
    let headers: { [key: string]: string } = { host: 'hostname', 'content-type': 'application/json' };
    if (trace_headers) {
      headers = { ...headers, ...trace_headers };
    }
    return new Promise((resolve, _reject) => {
      const d = domain.create();
      const req = {
        method: 'POST',
        url: '/path?q=query',
        headers: headers,
        body: { foo: 'bar' },
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
      expect(Sentry.startTransaction).toBeCalledWith({ name: 'POST /path', op: 'gcp.function.http' });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.setHttpStatus).toBeCalledWith(200);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalledWith(2000);
    });

    test('incoming trace headers are correctly parsed and used', async () => {
      expect.assertions(1);

      const handler: HttpFunction = (_req, res) => {
        res.statusCode = 200;
        res.end();
      };
      const wrappedHandler = wrapHttpFunction(handler);
      const traceHeaders = {
        'sentry-trace': '12312012123120121231201212312012-1121201211212012-0',
        tracestate: 'sentry=doGsaREgReaT,maisey=silly,charlie=goofy',
      };
      await handleHttp(wrappedHandler, traceHeaders);

      expect(Sentry.startTransaction).toBeCalledWith(
        expect.objectContaining({
          traceId: '12312012123120121231201212312012',
          parentSpanId: '1121201211212012',
          parentSampled: false,
          metadata: {
            tracestate: {
              sentry: 'sentry=doGsaREgReaT',
              thirdparty: 'maisey=silly,charlie=goofy',
            },
          },
        }),
      );
    });

    test('capture error', async () => {
      expect.assertions(5);

      const error = new Error('wat');
      const handler: HttpFunction = (_req, _res) => {
        throw error;
      };
      const wrappedHandler = wrapHttpFunction(handler);

      const trace_headers: { [key: string]: string } = {
        'sentry-trace': '12312012123120121231201212312012-1121201211212012-0',
      };

      await handleHttp(wrappedHandler, trace_headers);
      expect(Sentry.startTransaction).toBeCalledWith({
        name: 'POST /path',
        op: 'gcp.function.http',
        traceId: '12312012123120121231201212312012',
        parentSpanId: '1121201211212012',
        parentSampled: false,
      });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      expect(Sentry.captureException).toBeCalledWith(error);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalled();
    });
  });

  test('wrapHttpFunction request data', async () => {
    expect.assertions(7);

    const handler: HttpFunction = (_req, res) => {
      res.end();
    };
    const wrappedHandler = wrapHttpFunction(handler);
    const event: Event = {};
    // @ts-ignore see "Why @ts-ignore" note
    Sentry.fakeScope.addEventProcessor.mockImplementation(cb => cb(event));
    await handleHttp(wrappedHandler);
    expect(event.transaction).toEqual('POST /path');
    expect(event.contexts?.runtime).toEqual({ name: 'node', version: expect.anything() });
    expect(event.request?.method).toEqual('POST');
    expect(event.request?.url).toEqual('http://hostname/path?q=query');
    expect(event.request?.query_string).toEqual('q=query');
    expect(event.request?.headers).toEqual({ host: 'hostname', 'content-type': 'application/json' });
    expect(event.request?.data).toEqual('{"foo":"bar"}');
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
      expect(Sentry.fakeScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
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
      expect(Sentry.fakeScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
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
      expect(Sentry.fakeScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
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
      expect(Sentry.fakeScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
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
      expect(Sentry.fakeScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      expect(Sentry.captureException).toBeCalledWith(error);
    });
  });

  test('wrapEventFunction scope data', async () => {
    expect.assertions(3);

    const handler: EventFunction = (_data, _context) => 42;
    const wrappedHandler = wrapEventFunction(handler);
    await handleEvent(wrappedHandler);
    // @ts-ignore see "Why @ts-ignore" note
    expect(Sentry.fakeScope.setContext).toBeCalledWith('runtime', { name: 'node', version: expect.anything() });
    // @ts-ignore see "Why @ts-ignore" note
    expect(Sentry.fakeScope.setTag).toBeCalledWith('server_name', expect.anything());
    // @ts-ignore see "Why @ts-ignore" note
    expect(Sentry.fakeScope.setContext).toBeCalledWith('gcp.function.context', {
      eventType: 'event.type',
      resource: 'some.resource',
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
      expect(Sentry.fakeScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
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
      expect(Sentry.fakeScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
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
      expect(Sentry.fakeScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
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
      expect(Sentry.fakeScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
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
      expect(Sentry.fakeScope.setSpan).toBeCalledWith(Sentry.fakeTransaction);
      expect(Sentry.captureException).toBeCalledWith(error);
    });
  });

  test('wrapCloudEventFunction scope data', async () => {
    expect.assertions(3);

    const handler: CloudEventFunction = _context => 42;
    const wrappedHandler = wrapCloudEventFunction(handler);
    await handleCloudEvent(wrappedHandler);
    // @ts-ignore see "Why @ts-ignore" note
    expect(Sentry.fakeScope.setContext).toBeCalledWith('runtime', { name: 'node', version: expect.anything() });
    // @ts-ignore see "Why @ts-ignore" note
    expect(Sentry.fakeScope.setTag).toBeCalledWith('server_name', expect.anything());
    // @ts-ignore see "Why @ts-ignore" note
    expect(Sentry.fakeScope.setContext).toBeCalledWith('gcp.function.context', { type: 'event.type' });
  });

  describe('init()', () => {
    test('calls Sentry.init with correct sdk info metadata', () => {
      Sentry.GCPFunction.init({});

      expect(Sentry.init).toBeCalledWith(
        expect.objectContaining({
          _metadata: {
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
          },
        }),
      );
    });

    test('enhance event with correct mechanism value', () => {
      const eventWithSomeData = {
        exception: {
          values: [{}],
        },
      };

      // @ts-ignore see "Why @ts-ignore" note
      Sentry.addGlobalEventProcessor.mockImplementationOnce(cb => cb(eventWithSomeData));
      Sentry.GCPFunction.init({});

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
      });
    });
  });
});

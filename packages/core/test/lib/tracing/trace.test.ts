import { addTracingExtensions, Hub, makeMain } from '../../../src';
import { startActiveSpan } from '../../../src/tracing';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

beforeAll(() => {
  addTracingExtensions();
});

const enum Type {
  Sync = 'sync',
  Async = 'async',
}

let hub: Hub;
let client: TestClient;

describe('startActiveSpan', () => {
  beforeEach(() => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 0.0 });
    client = new TestClient(options);
    hub = new Hub(client);
    makeMain(hub);
  });

  describe.each([
    // isSync, isError, callback, expectedReturnValue
    [Type.Async, false, () => Promise.resolve('async good'), 'async good'],
    [Type.Sync, false, () => 'sync good', 'sync good'],
    [Type.Async, true, () => Promise.reject('async bad'), 'async bad'],
    [
      Type.Sync,
      true,
      () => {
        throw 'sync bad';
      },
      'sync bad',
    ],
  ])('with %s callback and error %s', (_type, isError, callback, expected) => {
    it('should return the same value as the callback', async () => {
      try {
        const result = await startActiveSpan({ name: 'GET users/[id]' }, () => {
          return callback();
        });
        expect(result).toEqual(expected);
      } catch (e) {
        expect(e).toEqual(expected);
      }
    });

    it('should return the same value as the callback if transactions are undefined', async () => {
      // @ts-ignore we are force overriding the transaction return to be undefined
      // The `startTransaction` types are actually wrong - it can return undefined
      // if tracingExtensions are not enabled
      jest.spyOn(hub, 'startTransaction').mockReturnValue(undefined);
      try {
        const result = await startActiveSpan({ name: 'GET users/[id]' }, () => {
          return callback();
        });
        expect(result).toEqual(expected);
      } catch (e) {
        expect(e).toEqual(expected);
      }
    });

    it('creates a transaction', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startActiveSpan({ name: 'GET users/[id]' }, () => {
          return callback();
        });
      } catch (e) {
        //
      }
      expect(ref).toBeDefined();

      expect(ref.name).toEqual('GET users/[id]');
      expect(ref.status).toEqual(isError ? 'internal_error' : undefined);
    });

    it('allows traceparent information to be overriden', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startActiveSpan(
          {
            name: 'GET users/[id]',
            parentSampled: true,
            traceId: '12345678901234567890123456789012',
            parentSpanId: '1234567890123456',
          },
          () => {
            return callback();
          },
        );
      } catch (e) {
        //
      }
      expect(ref).toBeDefined();

      expect(ref.sampled).toEqual(true);
      expect(ref.traceId).toEqual('12345678901234567890123456789012');
      expect(ref.parentSpanId).toEqual('1234567890123456');
    });

    it('allows for transaction to be mutated', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startActiveSpan({ name: 'GET users/[id]' }, span => {
          if (span) {
            span.op = 'http.server';
          }
          return callback();
        });
      } catch (e) {
        //
      }

      expect(ref.op).toEqual('http.server');
    });

    it('creates a span with correct description', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startActiveSpan({ name: 'GET users/[id]', parentSampled: true }, () => {
          return startActiveSpan({ name: 'SELECT * from users' }, () => {
            return callback();
          });
        });
      } catch (e) {
        //
      }

      expect(ref.spanRecorder.spans).toHaveLength(2);
      expect(ref.spanRecorder.spans[1].description).toEqual('SELECT * from users');
      expect(ref.spanRecorder.spans[1].parentSpanId).toEqual(ref.spanId);
      expect(ref.spanRecorder.spans[1].status).toEqual(isError ? 'internal_error' : undefined);
    });

    it('allows for span to be mutated', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startActiveSpan({ name: 'GET users/[id]', parentSampled: true }, () => {
          return startActiveSpan({ name: 'SELECT * from users' }, childSpan => {
            if (childSpan) {
              childSpan.op = 'db.query';
            }
            return callback();
          });
        });
      } catch (e) {
        //
      }

      expect(ref.spanRecorder.spans).toHaveLength(2);
      expect(ref.spanRecorder.spans[1].op).toEqual('db.query');
    });
  });
});

import { setAsyncContextStrategy, setCurrentClient, startSpan, startSpanManual } from '@sentry/core';
import type { TransactionEvent } from '@sentry/types';
import { NodeClient, defaultStackParser } from '../src';
import { setNodeAsyncContextStrategy } from '../src/async';
import { getDefaultNodeClientOptions } from './helper/node-client-options';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

beforeAll(() => {
  setNodeAsyncContextStrategy();
});

afterAll(() => {
  setAsyncContextStrategy(undefined);
});

describe('startSpan()', () => {
  it('should correctly separate spans when called after one another with interwoven timings', async () => {
    const transactionEventPromise = new Promise<TransactionEvent>(resolve => {
      setCurrentClient(
        new NodeClient(
          getDefaultNodeClientOptions({
            stackParser: defaultStackParser,
            tracesSampleRate: 1,
            beforeSendTransaction: event => {
              resolve(event);
              return null;
            },
            dsn,
          }),
        ),
      );
    });

    startSpan({ name: 'first' }, () => {
      return new Promise<void>(resolve => {
        setTimeout(resolve, 500);
      });
    });

    startSpan({ name: 'second' }, () => {
      return new Promise<void>(resolve => {
        setTimeout(resolve, 250);
      });
    });

    const transactionEvent = await transactionEventPromise;

    // Any transaction events happening shouldn't have any child spans
    expect(transactionEvent.spans).toStrictEqual([]);
  });

  it('should correctly nest spans when called within one another', async () => {
    const transactionEventPromise = new Promise<TransactionEvent>(resolve => {
      setCurrentClient(
        new NodeClient(
          getDefaultNodeClientOptions({
            stackParser: defaultStackParser,
            tracesSampleRate: 1,
            beforeSendTransaction: event => {
              resolve(event);
              return null;
            },
            dsn,
          }),
        ),
      );
    });

    startSpan({ name: 'first' }, () => {
      startSpan({ name: 'second' }, () => undefined);
    });

    const transactionEvent = await transactionEventPromise;

    expect(transactionEvent.spans).toContainEqual(expect.objectContaining({ description: 'second' }));
  });
});

describe('startSpanManual()', () => {
  it('should correctly separate spans when called after one another with interwoven timings', async () => {
    const transactionEventPromise = new Promise<TransactionEvent>(resolve => {
      setCurrentClient(
        new NodeClient(
          getDefaultNodeClientOptions({
            stackParser: defaultStackParser,
            tracesSampleRate: 1,
            beforeSendTransaction: event => {
              resolve(event);
              return null;
            },
            dsn,
          }),
        ),
      );
    });

    startSpanManual({ name: 'first' }, span => {
      return new Promise<void>(resolve => {
        setTimeout(() => {
          span?.end();
          resolve();
        }, 500);
      });
    });

    startSpanManual({ name: 'second' }, span => {
      return new Promise<void>(resolve => {
        setTimeout(() => {
          span?.end();
          resolve();
        }, 500);
      });
    });

    const transactionEvent = await transactionEventPromise;

    // Any transaction events happening shouldn't have any child spans
    expect(transactionEvent.spans).toStrictEqual([]);
  });

  it('should correctly nest spans when called within one another', async () => {
    const transactionEventPromise = new Promise<TransactionEvent>(resolve => {
      setCurrentClient(
        new NodeClient(
          getDefaultNodeClientOptions({
            stackParser: defaultStackParser,
            tracesSampleRate: 1,
            beforeSendTransaction: event => {
              resolve(event);
              return null;
            },
            dsn,
          }),
        ),
      );
    });

    startSpanManual({ name: 'first' }, span1 => {
      startSpanManual({ name: 'second' }, span2 => {
        span2?.end();
      });
      span1?.end();
    });

    const transactionEvent = await transactionEventPromise;

    expect(transactionEvent.spans).toContainEqual(expect.objectContaining({ description: 'second' }));
  });
});

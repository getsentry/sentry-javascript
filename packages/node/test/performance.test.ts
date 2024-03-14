import {
  setAsyncContextStrategy,
  setCurrentClient,
  startInactiveSpan,
  startSpan,
  startSpanManual,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import type { Span, TransactionEvent } from '@sentry/types';
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

    expect(transactionEvent.spans).toHaveLength(1);
    expect(transactionEvent.spans?.[0].description).toBe('second');
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
          span.end();
          resolve();
        }, 500);
      });
    });

    startSpanManual({ name: 'second' }, span => {
      return new Promise<void>(resolve => {
        setTimeout(() => {
          span.end();
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

    expect(transactionEvent.spans?.[0].description).toBe('second');
  });

  it('should use the scopes at time of creation instead of the scopes at time of termination', async () => {
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

    withIsolationScope(isolationScope1 => {
      isolationScope1.setTag('isolationScope', 1);
      withScope(scope1 => {
        scope1.setTag('scope', 1);
        startSpanManual({ name: 'my-span' }, span => {
          withIsolationScope(isolationScope2 => {
            isolationScope2.setTag('isolationScope', 2);
            withScope(scope2 => {
              scope2.setTag('scope', 2);
              span.end();
            });
          });
        });
      });
    });

    expect(await transactionEventPromise).toMatchObject({
      tags: {
        scope: 1,
        isolationScope: 1,
      },
    });
  });
});

describe('startInactiveSpan()', () => {
  it('should use the scopes at time of creation instead of the scopes at time of termination', async () => {
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

    let span: Span | undefined;

    withIsolationScope(isolationScope => {
      isolationScope.setTag('isolationScope', 1);
      withScope(scope => {
        scope.setTag('scope', 1);
        span = startInactiveSpan({ name: 'my-span' });
      });
    });

    withIsolationScope(isolationScope => {
      isolationScope.setTag('isolationScope', 2);
      withScope(scope => {
        scope.setTag('scope', 2);
        span?.end();
      });
    });

    expect(await transactionEventPromise).toMatchObject({
      tags: {
        scope: 1,
        isolationScope: 1,
      },
    });
  });
});

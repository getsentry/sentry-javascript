import { tracingChannel } from 'node:diagnostics_channel';
import { SENTRY_OP, SENTRY_ORIGIN, SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import type { Event, Span } from '@sentry/core';
import {
  flush,
  getActiveSpan,
  getIsolationScope,
  getRootSpan,
  setCurrentClient,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '../../src/async-context';
import { defaultShouldHandleError, instrumentORPC } from '../../src/integrations/orpc/instrumentation';
import { CHANNELS } from '../../src/orchestrion/channels';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

const channel = tracingChannel(CHANNELS.ORPC_EXECUTE_PROCEDURE);

function executeProcedure<T>(path: string[], fn: () => Promise<T>, input?: unknown): Promise<T> {
  return channel.tracePromise(fn, { arguments: [{}, { path, input }] });
}

function orpcError(code: string): Error {
  return Object.assign(new Error(code), { name: 'ORPCError', code });
}

describe('instrumentORPC', () => {
  let events: Event[];

  beforeAll(() => {
    setAsyncLocalStorageAsyncContextStrategy();
    instrumentORPC(defaultShouldHandleError);
  });

  function initClient(options: Parameters<typeof getDefaultTestClientOptions>[0] = {}): void {
    events = [];
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        beforeSend: event => {
          events.push(event);
          return null;
        },
        ...options,
      }),
    );
    setCurrentClient(client);
    client.init();
  }

  beforeEach(() => {
    getIsolationScope().setTransactionName(undefined);
    initClient();
  });

  it('wraps the procedure call in an active rpc span', async () => {
    let procedureSpan: Span | undefined;

    await startSpan({ name: 'GET /rpc/planet/find', op: 'http.server' }, async () => {
      await executeProcedure(['planet', 'find'], async () => {
        procedureSpan = getActiveSpan();
      });
    });

    const json = spanToJSON(procedureSpan!);
    expect(json).toMatchObject({
      name: 'planet/find',
      attributes: {
        [SENTRY_OP]: 'rpc',
        [SENTRY_ORIGIN]: 'auto.rpc.orpc',
        'rpc.system.name': 'orpc',
        'rpc.method': 'planet/find',
      },
    });
    expect(json.end_timestamp).toBeDefined();
  });

  it('renames an http.server root span to the procedure path', async () => {
    let rootSpan: Span | undefined;

    await startSpan({ name: 'POST /rpc/planet/find', op: 'http.server' }, async span => {
      rootSpan = span;
      await executeProcedure(['planet', 'find'], async () => undefined);
    });

    expect(spanToJSON(rootSpan!).name).toBe('planet/find');
    expect(spanToJSON(rootSpan!).attributes[SENTRY_SEGMENT_NAME_SOURCE]).toBe('route');
    expect(getIsolationScope().getScopeData().transactionName).toBe('planet/find');
  });

  it('does not rename a root span that is not http.server', async () => {
    let rootSpan: Span | undefined;
    let procedureSpan: Span | undefined;

    await startSpan({ name: 'cron job', op: 'function' }, async span => {
      rootSpan = span;
      await executeProcedure(['planet', 'find'], async () => {
        procedureSpan = getActiveSpan();
      });
    });

    expect(spanToJSON(rootSpan!).name).toBe('cron job');
    expect(getRootSpan(procedureSpan!)).toBe(rootSpan);
    expect(spanToJSON(procedureSpan!).attributes[SENTRY_OP]).toBe('rpc');
    expect(spanToJSON(procedureSpan!).attributes[SENTRY_ORIGIN]).toBe('auto.rpc.orpc');
  });

  it('captures a thrown error once and marks the span as errored', async () => {
    let procedureSpan: Span | undefined;
    const error = new Error('boom');

    await expect(
      executeProcedure(['planet', 'find'], async () => {
        procedureSpan = getActiveSpan();
        throw error;
      }),
    ).rejects.toBe(error);
    await flush();

    expect(events).toHaveLength(1);
    expect(events[0]!.exception?.values?.[0]?.mechanism).toMatchObject({ type: 'auto.rpc.orpc', handled: false });
    expect(events[0]!.contexts?.orpc).toEqual({ procedure_path: 'planet/find' });
    expect(spanToJSON(procedureSpan!).status).toBe('error');
  });

  it('does not capture an ORPCError with a 4xx code', async () => {
    await expect(
      executeProcedure(['planet', 'find'], async () => {
        throw orpcError('NOT_FOUND');
      }),
    ).rejects.toThrow('NOT_FOUND');
    await flush();

    expect(events).toHaveLength(0);
  });

  it('attaches the input only when incoming request bodies are collected', async () => {
    initClient({ sendDefaultPii: true });

    await expect(
      executeProcedure(
        ['planet', 'find'],
        async () => {
          throw new Error('boom');
        },
        { name: 'Earth' },
      ),
    ).rejects.toThrow('boom');
    await flush();

    expect(events[0]!.contexts?.orpc).toEqual({ procedure_path: 'planet/find', input: { name: 'Earth' } });
  });

  it('ends the span on return and captures errors thrown later from an async iterator', async () => {
    let procedureSpan: Span | undefined;

    const output = await executeProcedure(['planet', 'stream'], async () => {
      procedureSpan = getActiveSpan();
      return (async function* () {
        yield 1;
        throw new Error('stream failed');
      })();
    });

    expect(spanToJSON(procedureSpan!).end_timestamp).toBeDefined();

    await expect(
      (async () => {
        for await (const _ of output) {
          // drain
        }
      })(),
    ).rejects.toThrow('stream failed');
    await flush();

    expect(events).toHaveLength(1);
    expect(events[0]!.exception?.values?.[0]?.value).toBe('stream failed');
  });
});

describe('defaultShouldHandleError', () => {
  it.each([
    ['an error without a status', new Error('boom'), true],
    ['a non-object', 'boom', true],
    ['an error with a status', Object.assign(new Error('Not found'), { status: 404 }), true],
    ['an INTERNAL_SERVER_ERROR ORPCError', orpcError('INTERNAL_SERVER_ERROR'), true],
    ['a NOT_FOUND ORPCError', orpcError('NOT_FOUND'), false],
    ['an ORPCError with a custom code', orpcError('RATE_LIMITED'), false],
    ['an abort error', Object.assign(new Error('aborted'), { name: 'AbortError' }), false],
  ])('returns the right result for %s', (_, error, expected) => {
    expect(defaultShouldHandleError(error)).toBe(expected);
  });
});

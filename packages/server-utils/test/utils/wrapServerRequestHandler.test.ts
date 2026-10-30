import { HTTP_ROUTE, SENTRY_SEGMENT_NAME_SOURCE, URL_PATH_PARAMETER_KEY_BASE } from '@sentry/conventions/attributes';
import type { Event } from '@sentry/core';
import { getIsolationScope, setCurrentClient, withIsolationScope } from '@sentry/core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '../../src/async-context';
import type { ServerRequestHandlerConfig } from '../../src/utils/wrapServerRequestHandler';
import { wrapServerRequestHandler } from '../../src/utils/wrapServerRequestHandler';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

const MECHANISM = { handled: false, type: 'auto.http.test' };

function setup(
  options: ServerRequestHandlerConfig['options'] = {},
  extra: Partial<ServerRequestHandlerConfig> = {},
): {
  events: Event[];
  transactions: Event[];
  serve: <R extends Response | undefined = Response>(request: Request, handler: () => R | Promise<R>) => Promise<R>;
} {
  const events: Event[] = [];
  const transactions: Event[] = [];
  const client = new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
      beforeSend: event => {
        events.push(event);
        return null;
      },
      beforeSendTransaction: event => {
        transactions.push(event);
        return null;
      },
    }),
  );
  setCurrentClient(client);
  client.init();

  const serve = <R extends Response | undefined = Response>(
    request: Request,
    handler: () => R | Promise<R>,
  ): Promise<R> =>
    withIsolationScope(isolationScope =>
      wrapServerRequestHandler(
        { request, client, isolationScope, options, origin: 'auto.http.test', mechanism: MECHANISM, ...extra },
        handler,
      ),
    );
  return { events, transactions, serve };
}

describe('wrapServerRequestHandler', () => {
  beforeAll(() => {
    setAsyncLocalStorageAsyncContextStrategy();
  });

  it.each(['OPTIONS', 'HEAD'])(
    'attaches request data and captures errors for %s requests, without a span',
    async method => {
      const { events, transactions, serve } = setup();
      const error = new Error(`${method} failed`);

      await expect(
        serve(new Request('https://example.com/cors', { method }), () => {
          expect(getIsolationScope().getScopeData().sdkProcessingMetadata.normalizedRequest?.method).toBe(method);
          throw error;
        }),
      ).rejects.toBe(error);

      expect(events).toHaveLength(1);
      expect(events[0]?.exception?.values?.[0]?.mechanism).toEqual(MECHANISM);
      expect(transactions).toHaveLength(0);
    },
  );

  it('skips the body when ignoreRequestBody throws', async () => {
    const { serve } = setup({
      ignoreRequestBody: () => {
        throw new Error('filter failed');
      },
    });
    let data: unknown = 'not read';

    const response = await serve(new Request('https://example.com/login', { method: 'POST', body: 'secret' }), () => {
      data = getIsolationScope().getScopeData().sdkProcessingMetadata.normalizedRequest?.data;
      return new Response('ok');
    });

    expect(await response.text()).toBe('ok');
    expect(data).toBeUndefined();
  });

  it('calls onSpanEnd and ends the span when a streamed response finishes', async () => {
    const calls: string[] = [];
    const { transactions, serve } = setup({
      onSpanEnd: (span, _request, response) => {
        calls.push('onSpanEnd');
        span.setAttribute('onSpanEnd.status', response.status);
      },
    });
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const source = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });

    const response = await serve(
      new Request('https://example.com/events'),
      () => new Response(source, { status: 201, headers: { 'content-type': 'text/event-stream' } }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    controller!.enqueue(new TextEncoder().encode('data: one\n\n'));
    expect(calls).toEqual([]);

    controller!.close();
    expect(await response.text()).toBe('data: one\n\n');
    await vi.waitFor(() => expect(transactions).toHaveLength(1));

    expect(calls).toEqual(['onSpanEnd']);
    expect(transactions[0]?.contexts?.trace?.data?.['onSpanEnd.status']).toBe(201);
  });

  // Serves a streamed response whose source fails after the handler returns.
  async function serveFailingStream(
    serve: ReturnType<typeof setup>['serve'],
    error: unknown = new Error('stream interrupted'),
  ): Promise<void> {
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const source = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });

    const response = await serve(
      new Request('https://example.com/events'),
      () => new Response(source, { headers: { 'content-type': 'application/x-ndjson' } }),
    );
    const text = response.text();
    controller!.error(error);
    await expect(text).rejects.toBe(error);
  }

  it('captures an error from a streamed response source and marks the span as failed', async () => {
    const { events, transactions, serve } = setup({ spans: true });

    await serveFailingStream(serve);
    await vi.waitFor(() => expect(transactions).toHaveLength(1));

    expect(events).toHaveLength(1);
    expect(events[0]?.exception?.values?.[0]?.mechanism).toEqual(MECHANISM);
    expect(transactions[0]?.contexts?.trace?.status).toBe('internal_error');
  });

  it('captures an error from a streamed response source without a span', async () => {
    const { events, transactions, serve } = setup({ spans: false });

    await serveFailingStream(serve);
    await vi.waitFor(() => expect(events).toHaveLength(1));

    expect(events[0]?.exception?.values?.[0]?.mechanism).toEqual(MECHANISM);
    expect(transactions).toHaveLength(0);
  });

  it('ends the span when the handler returns no response, as after a WebSocket upgrade', async () => {
    const onSpanEnd = vi.fn();
    const { events, transactions, serve } = setup({ spans: true, onSpanEnd });

    const response = await serve(new Request('https://example.com/socket'), () => undefined);
    await vi.waitFor(() => expect(transactions).toHaveLength(1));

    expect(response).toBeUndefined();
    expect(events).toHaveLength(0);
    expect(transactions[0]?.contexts?.response).toBeUndefined();
    expect(onSpanEnd).not.toHaveBeenCalled();
  });

  it('does not capture or fail the span when the client disconnects from a streamed response', async () => {
    const { events, transactions, serve } = setup({ spans: true });

    await serveFailingStream(serve, new DOMException('The request has been cancelled.', 'AbortError'));
    await vi.waitFor(() => expect(transactions).toHaveLength(1));

    expect(events).toHaveLength(0);
    expect(transactions[0]?.contexts?.trace?.status).toBe('ok');
  });

  it('names the span after the route and adds the runtime attributes', async () => {
    const { transactions, serve } = setup(
      {},
      { routeName: '/users/:id', attributes: { [`${URL_PATH_PARAMETER_KEY_BASE}.id`]: '42' } },
    );

    const response = await serve(new Request('https://example.com/users/42'), () => new Response('ok'));
    expect(await response.text()).toBe('ok');
    await vi.waitFor(() => expect(transactions).toHaveLength(1));

    expect(transactions[0]?.transaction).toBe('GET /users/:id');
    expect(transactions[0]?.contexts?.trace?.data).toEqual(
      expect.objectContaining({
        [HTTP_ROUTE]: '/users/:id',
        [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
        [`${URL_PATH_PARAMETER_KEY_BASE}.id`]: '42',
      }),
    );
  });

  it('keeps every Set-Cookie header of the response', async () => {
    const { transactions, serve } = setup();
    const headers = new Headers();
    headers.append('set-cookie', 'first=1');
    headers.append('set-cookie', 'second=2');

    const response = await serve(new Request('https://example.com/login'), () => new Response('ok', { headers }));
    expect(await response.text()).toBe('ok');
    await vi.waitFor(() => expect(transactions).toHaveLength(1));

    const setCookie = transactions[0]?.contexts?.trace?.data?.['http.response.header.set-cookie'] as string[];
    expect(setCookie.map(cookie => cookie.split('=')[0])).toEqual(['first', 'second']);
  });

  it('calls onDone once with the response, or without one when the handler throws', async () => {
    const done: (number | undefined)[] = [];
    const { serve } = setup({}, { onDone: response => done.push(response?.status) });

    const response = await serve(new Request('https://example.com/ok'), () => new Response('ok', { status: 201 }));
    await response.text();
    await expect(
      serve(new Request('https://example.com/throws'), () => {
        throw new Error('handler failed');
      }),
    ).rejects.toThrow('handler failed');
    await serve(new Request('https://example.com/cors', { method: 'OPTIONS' }), () => new Response(null));

    expect(done).toEqual([201, undefined, 200]);
  });

  it('does not capture errors without a mechanism', async () => {
    const { events, serve } = setup({}, { mechanism: undefined });

    await expect(
      serve(new Request('https://example.com/throws'), () => {
        throw new Error('handler failed');
      }),
    ).rejects.toThrow('handler failed');

    expect(events).toHaveLength(0);
  });

  it('calls onDone at once when isStreamingResponse returns false', async () => {
    const onDone = vi.fn();
    const { serve } = setup({}, { onDone, isStreamingResponse: () => false });
    const source = new ReadableStream<Uint8Array>({
      start() {
        // never closes
      },
    });
    const original = new Response(source, { headers: { 'content-type': 'text/event-stream' } });

    const response = await serve(new Request('https://example.com/events'), () => original);

    expect(response).toBe(original);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

import {
  CODE_FUNCTION_NAME,
  HTTP_REQUEST_METHOD,
  HTTP_ROUTE,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_SEGMENT_NAME_SOURCE,
} from '@sentry/conventions/attributes';
import { FUNCTION, HTTP_SERVER } from '@sentry/conventions/op';
import type { StreamedSpanJSON } from '@sentry/core';
import {
  createTransport,
  getIsolationScope,
  setCurrentClient,
  spanToJSON,
  startSpan,
  startSpanManual,
  withIsolationScope,
} from '@sentry/core';
import { NodeClient } from '@sentry/node';
import type { InvocationEvent, RenderEvent } from '@solidjs/web';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { solidServerObserveIntegration } from '../../../src/solid2/server';

type Listener = (event: unknown, live: unknown) => void;

const { listeners } = vi.hoisted(() => ({ listeners: new Map<string, Listener>() }));

// The production build has no `OBSERVE`; observe and dev builds do.
vi.mock('solid-js', async importOriginal => ({
  ...(await importOriginal<object>()),
  OBSERVE: {
    records: {
      subscribe: (type: string, listener: Listener) => {
        listeners.set(type, listener);
        return () => listeners.delete(type);
      },
    },
  },
}));

function emit(type: 'invocation', event: InvocationEvent): void;
function emit(type: 'render', event: RenderEvent): void;
function emit(type: string, event: unknown): void {
  listeners.get(type)?.(event, {});
}

describe('solidServerObserveIntegration', () => {
  let ended: StreamedSpanJSON[];

  beforeEach(() => {
    listeners.clear();
    ended = [];
    const client = new NodeClient({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
      integrations: [],
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
      stackParser: () => [],
    });
    setCurrentClient(client);
    client.init();
    client.on('spanEnd', span => {
      ended.push(spanToJSON(span));
    });
    solidServerObserveIntegration().setup!(client);
  });

  describe('server function executions', () => {
    it('adds a span under the active span, with the recorded timing', () => {
      const at = performance.now() - 50;

      const parentSpanId = startSpan({ name: 'POST /_server' }, span => {
        emit('invocation', { id: 'src/api.ts#getUser', direct: false, at, durationMs: 20, outcome: 'ok' });
        return span.spanContext().spanId;
      });

      const span = ended.find(one => one.name === 'src/api.ts#getUser');
      expect(span).toMatchObject({
        parent_span_id: parentSpanId,
        status: 'ok',
        attributes: expect.objectContaining({
          [SENTRY_OP]: FUNCTION,
          [SENTRY_ORIGIN]: 'auto.function.solid.server_function',
          [CODE_FUNCTION_NAME]: 'src/api.ts#getUser',
        }),
      });
      expect(span?.start_timestamp).toBeCloseTo((performance.timeOrigin + at) / 1000, 3);
      expect(span?.end_timestamp).toBeCloseTo((performance.timeOrigin + at + 20) / 1000, 3);
    });

    it('marks a failed execution', () => {
      startSpan({ name: 'POST /_server' }, () => {
        emit('invocation', { id: 'fail', direct: false, at: performance.now(), durationMs: 1, outcome: 'error' });
      });

      expect(ended.find(one => one.name === 'fail')?.status).toBe('error');
    });

    it('adds no span outside a request', () => {
      emit('invocation', { id: 'orphan', direct: false, at: performance.now(), durationMs: 1, outcome: 'ok' });

      expect(ended).toEqual([]);
    });
  });

  describe('render routes', () => {
    const render = (route?: RenderEvent['route']): RenderEvent => ({
      mode: 'stream',
      at: performance.now(),
      durationMs: 1,
      boundaries: 0,
      outcome: 'complete',
      route,
    });

    it('names the request span after the route of the render', () => {
      withIsolationScope(() => {
        startSpanManual(
          { name: 'GET /user/5', op: HTTP_SERVER, attributes: { [HTTP_REQUEST_METHOD]: 'GET' } },
          span => {
            emit('render', render({ name: '/user/:id', to: '/user/5', params: { id: '5' } }));

            expect(spanToJSON(span)).toMatchObject({
              name: 'GET /user/:id',
              attributes: expect.objectContaining({
                [HTTP_ROUTE]: '/user/:id',
                [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
                'url.path.parameter.id': '5',
              }),
            });
            expect(getIsolationScope().getScopeData().transactionName).toBe('GET /user/:id');
            span.end();
          },
        );
      });
    });

    it('keeps a name the router wrapper set', () => {
      startSpanManual(
        { name: 'GET /user/:userId', op: HTTP_SERVER, attributes: { [SENTRY_SEGMENT_NAME_SOURCE]: 'route' } },
        span => {
          emit('render', render({ name: '/user/:id' }));

          expect(spanToJSON(span).name).toBe('GET /user/:userId');
          span.end();
        },
      );
    });

    it('leaves other spans alone', () => {
      startSpanManual({ name: 'some work', op: FUNCTION }, span => {
        emit('render', render({ name: '/user/:id' }));

        expect(spanToJSON(span).name).toBe('some work');
        span.end();
      });
    });

    it('does nothing without a route', () => {
      startSpanManual({ name: 'GET /user/5', op: HTTP_SERVER }, span => {
        emit('render', render());

        expect(spanToJSON(span).name).toBe('GET /user/5');
        span.end();
      });
    });
  });
});

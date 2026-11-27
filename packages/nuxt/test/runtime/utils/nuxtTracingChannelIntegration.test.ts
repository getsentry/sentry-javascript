/** @vitest-environment node */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CODE_FUNCTION_NAME, HTTP_ROUTE, SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { FUNCTION, HTTP_CLIENT, HTTP_SERVER } from '@sentry/conventions/op';
import type { Client, Integration, StreamedSpanJSON } from '@sentry/core';
import { createTransport, getActiveSpan, getCurrentScope, spanToJSON, startNewTrace, startSpan } from '@sentry/core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { withNuxtTracingChannelIntegration } from '../../../src/runtime/utils/nuxtTracingChannelIntegration';
import { init } from '../../../src/server';

type TraceAsync = <T>(name: string, context: object, fn: () => Promise<T>) => Promise<T>;

/** Nuxt's own `traceAsync`. It is not in the `exports` of `nuxt`, so the test imports the file by path. */
async function importNuxtTraceAsync(): Promise<TraceAsync> {
  const nuxtDir = dirname(createRequire(import.meta.url).resolve('nuxt/package.json'));
  const tracing: { traceAsync: TraceAsync } = await import(
    pathToFileURL(join(nuxtDir, 'dist/app/internal/tracing.js')).href
  );
  return tracing.traceAsync;
}

const RENDER_ORIGIN = 'auto.function.nuxt.render';

function renderSpanAttributes(name: string): Record<string, string> {
  return { [SENTRY_OP]: FUNCTION, [SENTRY_ORIGIN]: RENDER_ORIGIN, [CODE_FUNCTION_NAME]: name };
}

// All tests share one client, because the channel subscribers of an integration stay for the whole process.
describe('nuxtTracingChannelIntegration', () => {
  let client: Client;
  let traceAsync: TraceAsync;
  const endedSpans: StreamedSpanJSON[] = [];

  /** Publishes a `nuxt.render` event inside an `http.server` root span. Returns the ended spans of that request. */
  async function render(
    payload: object,
    renderToString: () => Promise<unknown> = () => Promise.resolve({ html: '<div id="__nuxt"></div>' }),
    { rejects = false }: { rejects?: boolean } = {},
  ): Promise<StreamedSpanJSON[]> {
    const traceId = await startNewTrace(() =>
      startSpan({ name: 'GET', op: HTTP_SERVER }, async rootSpan => {
        const rendered = traceAsync('nuxt.render', payload, renderToString);
        await (rejects ? rendered.catch(() => undefined) : rendered);
        return spanToJSON(rootSpan).trace_id;
      }),
    );

    return endedSpans.filter(span => span.trace_id === traceId);
  }

  function getParent(span: StreamedSpanJSON | undefined, spans: StreamedSpanJSON[]): StreamedSpanJSON | undefined {
    return spans.find(candidate => candidate.span_id === span?.parent_span_id);
  }

  beforeAll(async () => {
    traceAsync = await importNuxtTraceAsync();

    const nuxtClient = init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, () => Promise.resolve({})),
    });
    if (!nuxtClient) {
      throw new Error('The Nuxt server SDK did not initialize.');
    }
    client = nuxtClient;
    client.on('spanEnd', span => endedSpans.push(spanToJSON(span)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await client.close();
    getCurrentScope().setClient(undefined);
  });

  describe('nuxt.render', () => {
    it('creates a `renderPage` span as a child of the request root span', async () => {
      const spans = await render({ ssrContext: { error: false, url: '/test-param/1234' }, streaming: false });

      const renderSpans = spans.filter(span => span.attributes[SENTRY_OP] === FUNCTION);

      expect(renderSpans).toHaveLength(1);
      expect(renderSpans[0]?.name).toBe('renderPage');
      expect(renderSpans[0]?.attributes).toEqual(renderSpanAttributes('renderPage'));
      expect(renderSpans[0]?.status).toBe('ok');
      expect(getParent(renderSpans[0], spans)?.attributes[SENTRY_OP]).toBe(HTTP_SERVER);
    });

    it('names the span `renderErrorPage` for the render of the error page', async () => {
      const spans = await render({ ssrContext: { error: true, url: '/ssr-error' }, streaming: false });

      const renderSpans = spans.filter(span => span.attributes[SENTRY_OP] === FUNCTION);

      expect(renderSpans).toHaveLength(1);
      expect(renderSpans[0]?.name).toBe('renderErrorPage');
      expect(renderSpans[0]?.attributes).toEqual(renderSpanAttributes('renderErrorPage'));
    });

    it('adds the route that the Vue router matched during the render', async () => {
      const ssrContext: Record<string, unknown> = { error: false, url: '/users/42/posts/7?include=comments' };

      // Nuxt sets `ssrContext.nuxt` during the render.
      const spans = await render({ ssrContext, streaming: false }, async () => {
        ssrContext.nuxt = {
          $router: {
            currentRoute: { value: { matched: [{ path: '/users/:id()' }, { path: '/users/:id()/posts/:postId()' }] } },
          },
        };
      });

      const renderSpan = spans.find(span => span.name === 'renderPage');

      expect(renderSpan?.attributes).toEqual({
        ...renderSpanAttributes('renderPage'),
        [HTTP_ROUTE]: '/users/:id()/posts/:postId()',
      });
    });

    it.each([
      { description: 'no `ssrContext`', payload: {} },
      { description: 'a `ssrContext` that is no object', payload: { ssrContext: 'ssr-context' } },
      { description: 'no Nuxt app', payload: { ssrContext: { error: false, nuxt: undefined } } },
      { description: 'no router', payload: { ssrContext: { error: false, nuxt: {} } } },
      {
        description: 'a route that matches no page',
        payload: { ssrContext: { error: false, nuxt: { $router: { currentRoute: { value: { matched: [] } } } } } },
      },
      {
        description: 'a matched route without a path',
        payload: { ssrContext: { error: false, nuxt: { $router: { currentRoute: { value: { matched: [{}] } } } } } },
      },
    ])('creates a `renderPage` span without a route for a payload with $description', async ({ payload }) => {
      const spans = await render(payload);

      const renderSpans = spans.filter(span => span.attributes[SENTRY_OP] === FUNCTION);

      expect(renderSpans).toHaveLength(1);
      expect(renderSpans[0]?.attributes).toEqual(renderSpanAttributes('renderPage'));
    });

    it('makes a span that starts during the render a child of the render span', async () => {
      const spans = await render({ ssrContext: { error: false }, streaming: false }, () =>
        startSpan({ name: 'GET https://api.example.com/users/42', op: HTTP_CLIENT }, () => Promise.resolve()),
      );

      const fetchSpan = spans.find(span => span.attributes[SENTRY_OP] === HTTP_CLIENT);

      expect(fetchSpan).toBeDefined();
      expect(getParent(fetchSpan, spans)?.name).toBe('renderPage');
    });

    it('ends the span when the render settles, not when the render returns its promise', async () => {
      const activeSpansAfterAwait: Array<Pick<StreamedSpanJSON, 'name' | 'end_timestamp'>> = [];

      await render({ ssrContext: { error: false }, streaming: false }, async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        const { name, end_timestamp } = spanToJSON(getActiveSpan()!);
        activeSpansAfterAwait.push({ name, end_timestamp });
      });

      expect(activeSpansAfterAwait).toEqual([{ name: 'renderPage', end_timestamp: undefined }]);
    });

    it('sets the error status on the span of a render that rejects', async () => {
      const spans = await render(
        { ssrContext: { error: false }, streaming: false },
        () => Promise.reject(new TypeError('Cannot read properties of undefined (reading "title")')),
        { rejects: true },
      );

      expect(spans.find(span => span.name === 'renderPage')?.status).toBe('error');
    });

    it('captures no error for a render that rejects, because the Nitro error hook captures it', async () => {
      const captureException = vi.spyOn(client, 'captureException');

      await render(
        { ssrContext: { error: false }, streaming: false },
        () => Promise.reject(new TypeError('Cannot read properties of undefined (reading "title")')),
        { rejects: true },
      );

      expect(captureException).not.toHaveBeenCalled();
    });

    it('sets the error status when a component fails and Nuxt keeps the error in the payload', async () => {
      const ssrContext: Record<string, unknown> = { error: false, payload: {} };

      const spans = await render({ ssrContext, streaming: false }, async () => {
        ssrContext.payload = { error: { statusCode: 500, message: 'Nuxt 4 SSR error' } };
      });

      expect(spans.find(span => span.name === 'renderPage')?.status).toBe('error');
    });

    it.each([
      { description: 'an error without a status code', error: { message: 'Nuxt 4 SSR error' } },
      { description: 'a 503 error with the deprecated `statusCode`', error: { statusCode: 503 } },
      { description: 'a 299 status', error: { status: 299 } },
      { description: 'a 500 status', error: { status: 500 } },
    ])('sets the error status when the payload has $description', async ({ error }) => {
      const spans = await render({ ssrContext: { error: false, payload: { error } }, streaming: false });

      expect(spans.find(span => span.name === 'renderPage')?.status).toBe('error');
    });

    // `sentryCaptureErrorHook` does not report these errors either.
    it.each([
      { description: 'a 404 status', error: { status: 404, statusText: 'Page not found: /products/unknown' } },
      { description: 'a 404 error with the deprecated `statusCode`', error: { statusCode: 404 } },
      { description: 'a 300 status', error: { status: 300 } },
      { description: 'a 499 status', error: { status: 499 } },
    ])('keeps the ok status when the payload has $description', async ({ error }) => {
      const spans = await render({ ssrContext: { error: false, payload: { error } }, streaming: false });

      expect(spans.find(span => span.name === 'renderPage')?.status).toBe('ok');
    });

    it('keeps the ok status and adds no route for a render that Nuxt skips after a redirect in a route middleware', async () => {
      const ssrContext = {
        error: false,
        '~renderResponse': { statusCode: 302, headers: { location: '/login' } },
        // The router is already at the target of the redirect.
        nuxt: { $router: { currentRoute: { value: { matched: [{ path: '/login' }] } } } },
      };

      // Nuxt rejects the render with this error and catches it.
      const spans = await render({ ssrContext, streaming: false }, () => Promise.reject(new Error('skipping render')), {
        rejects: true,
      });

      const renderSpan = spans.find(span => span.name === 'renderPage');

      expect(renderSpan?.status).toBe('ok');
      expect(renderSpan?.attributes).toEqual(renderSpanAttributes('renderPage'));
    });

    it('adds the route of a page that redirects while it renders', async () => {
      const ssrContext = {
        error: false,
        '~renderResponse': { statusCode: 302, headers: { location: '/login' } },
        nuxt: { $router: { currentRoute: { value: { matched: [{ path: '/account' }] } } } },
      };

      const spans = await render({ ssrContext, streaming: false });

      const renderSpan = spans.find(span => span.name === 'renderPage');

      expect(renderSpan?.status).toBe('ok');
      expect(renderSpan?.attributes).toEqual({ ...renderSpanAttributes('renderPage'), [HTTP_ROUTE]: '/account' });
    });

    it('keeps the ok status for the render of the error page, whose payload has the error', async () => {
      const spans = await render({
        ssrContext: { error: true, payload: { error: { statusCode: 500, message: 'Nuxt 4 SSR error' } } },
        streaming: false,
      });

      expect(spans.find(span => span.name === 'renderErrorPage')?.status).toBe('ok');
    });

    it('lets the error of a failed render reach Nuxt', async () => {
      const renderError = new TypeError('Cannot read properties of undefined (reading "title")');

      const rendered = startSpan({ name: 'GET', op: HTTP_SERVER }, () =>
        traceAsync('nuxt.render', { ssrContext: { error: false } }, () => Promise.reject(renderError)),
      );

      await expect(rendered).rejects.toBe(renderError);
    });

    it('creates no span for a render outside a request root span', async () => {
      const endedSpanCount = endedSpans.length;

      await traceAsync('nuxt.render', { ssrContext: { error: false }, streaming: false }, () => Promise.resolve());

      expect(endedSpans).toHaveLength(endedSpanCount);
    });

    // An active non-recording span would hide the incoming trace from errors in the render.
    it('sets no active span for a render outside a request root span', async () => {
      const activeSpans: unknown[] = [];

      await traceAsync('nuxt.render', { ssrContext: { error: false }, streaming: false }, async () => {
        activeSpans.push(getActiveSpan());
      });

      expect(activeSpans).toEqual([undefined]);
    });
  });
});

describe('withNuxtTracingChannelIntegration', () => {
  const httpIntegration = { name: 'Http' };
  const appIntegration = { name: 'AppIntegration' };

  it('adds the integration after the default integrations', () => {
    const integrations = withNuxtTracingChannelIntegration(undefined)([httpIntegration]);

    expect(integrations.map(integration => integration.name)).toEqual(['Http', 'NuxtTracingChannel']);
  });

  it('keeps the integrations of a user array', () => {
    const integrations = withNuxtTracingChannelIntegration([appIntegration])([httpIntegration]);

    expect(integrations.map(integration => integration.name)).toEqual(['Http', 'NuxtTracingChannel', 'AppIntegration']);
  });

  it('passes the integration to a user function, which can remove it', () => {
    const removeNuxtIntegration = (defaults: Integration[]): Integration[] =>
      defaults.filter(integration => integration.name !== 'NuxtTracingChannel');

    const integrations = withNuxtTracingChannelIntegration(removeNuxtIntegration)([httpIntegration]);

    expect(integrations).toEqual([httpIntegration]);
  });
});

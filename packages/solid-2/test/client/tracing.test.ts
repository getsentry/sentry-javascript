/**
 * @vitest-environment jsdom
 */
import type { Event, Integration, StreamedSpanJSON } from '@sentry/core';
import {
  createTransport,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  setCurrentClient,
  spanStreamingIntegration,
  spanToJSON,
} from '@sentry/core';
import { OBSERVE, createEffect, createRoot, createSignal, flush } from 'solid-js';
import { attribution } from 'solid-js/attribution';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserClient, solidBrowserTracingIntegration, solidTracingIntegration } from '../../src/client';
import type { SolidTracingOptions } from '../../src/client';

interface Captured {
  events: Event[];
  spans: StreamedSpanJSON[];
}

function clientWith(
  options?: SolidTracingOptions,
  browserTracing: Integration[] = [],
): { client: BrowserClient; captured: Captured } {
  const captured: Captured = { events: [], spans: [] };
  const client = new BrowserClient({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    tracesSampleRate: 1,
    integrations: [spanStreamingIntegration(), ...browserTracing, solidTracingIntegration(options)],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    stackParser: () => [],
    beforeSend: event => {
      captured.events.push(event);
      return null;
    },
    beforeSendSpan: span => {
      captured.spans.push(span);
      return span;
    },
  });
  setCurrentClient(client);
  client.init();
  return { client, captured };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function readerApp(): { setCount: (n: number) => void; dispose: () => void } {
  const [count, setCount] = createSignal(0, { name: 'count' });
  const dispose = createRoot(dispose => {
    createEffect(count, () => {}, { name: 'reader' });
    return dispose;
  });
  flush();
  return { setCount, dispose };
}

describe('solidTracingIntegration', () => {
  beforeEach(() => {
    getCurrentScope().setClient(undefined);
  });
  afterEach(() => {
    attribution.disable();
    flush();
  });

  it('holds the engine beside other consumers and lets go of only its own hold', async () => {
    // A co-holder (Solid's own Performance-panel tracks, a diagnostics capture) first.
    const releaseOther = attribution.enable({ log: false });
    const { client, captured } = clientWith();
    expect(OBSERVE!.attribution.installed).not.toBeNull();

    // The other consumer leaves; the SDK's hold keeps the engine up and recording.
    releaseOther();
    expect(OBSERVE!.attribution.installed).not.toBeNull();
    const app = readerApp();
    OBSERVE!.attribution.withInteraction({ type: 'click', target: 'button#save' }, () => app.setCount(1));
    flush();
    await settle();
    await client.flush(100);
    expect(captured.spans.some(span => span.attributes['sentry.op'] === 'ui.interaction.click')).toBe(true);

    // A second init replaces the first hold rather than stacking a new one:
    // after a co-holder's release the engine is still up (the SDK's hold),
    // and a global disable() — the test harness's reset — takes it down.
    clientWith();
    const releaseAgain = attribution.enable();
    releaseAgain();
    expect(OBSERVE!.attribution.installed).not.toBeNull();
    app.dispose();
  });

  it('takes no hold on a client that will never start a span', () => {
    const client = new BrowserClient({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      integrations: [solidTracingIntegration()],
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
      stackParser: () => [],
    });
    setCurrentClient(client);
    client.init();
    expect(OBSERVE!.attribution.installed).toBeNull();
  });

  it("an interaction span starts at the browser event's own timestamp and carries the input delay", async () => {
    const { client, captured } = clientWith();
    const app = readerApp();
    // The web runtime dates the frame from `event.timeStamp`; 40ms of queueing before the handler ran.
    const at = performance.now() - 40;
    OBSERVE!.attribution.withInteraction({ type: 'click', target: 'button#save', at }, () => app.setCount(1));
    flush();
    await settle();
    await client.flush(100);

    const segment = captured.spans.find(
      span => span.is_segment && span.attributes['sentry.op'] === 'ui.interaction.click',
    )!;
    expect(segment.start_timestamp).toBeCloseTo((performance.timeOrigin + at) / 1000, 3);
    expect(segment.attributes['solid.interaction.inputDelayMs']).toBeGreaterThanOrEqual(39);
    expect(segment.end_timestamp).toBeGreaterThan(segment.start_timestamp + 0.039);
    app.dispose();
  });

  it('turns a user interaction into a segment with the navigation it performed as a child', async () => {
    const { client, captured } = clientWith();
    expect(OBSERVE!.attribution.installed).not.toBeNull();
    const app = readerApp();

    OBSERVE!.attribution.withInteraction({ type: 'click', target: 'button#next "Next"' }, () =>
      OBSERVE!.attribution.withOrigin(
        { kind: 'navigation', name: '/users/:id', to: '/users/42', from: '/', params: { id: '42' } },
        () => app.setCount(1),
      ),
    );
    flush();
    await settle();
    await client.flush(100);

    const segment = captured.spans.find(span => span.is_segment);
    expect(segment).toBeDefined();
    // Element text is user data: off by default, the element stays.
    expect(segment).toMatchObject({
      name: 'click on button#next',
      attributes: expect.objectContaining({
        'sentry.op': 'ui.interaction.click',
        'solid.interaction.type': 'click',
        'solid.interaction.target': 'button#next',
        'solid.interaction.writes': 1,
        'solid.navigations': 1,
        'sentry.origin': 'auto.ui.solid.attribution',
      }),
    });
    // The record's totals are the span's; no per-run subscription (the engine
    // builds re-run records only for an audience, and the SDK is not one).
    expect(segment!.attributes['solid.reruns']).toBeGreaterThanOrEqual(1);
    expect(segment!.attributes['solid.runMs']).toBeGreaterThanOrEqual(0);
    expect(segment!.attributes['solid.hot']).toBeUndefined();

    const nav = captured.spans.find(span => span.attributes['sentry.op'] === 'navigation');
    expect(nav).toMatchObject({
      name: '/users/:id',
      parent_span_id: segment!.span_id,
      trace_id: segment!.trace_id,
      attributes: expect.objectContaining({
        'solid.navigation.to': '/users/42',
        'solid.navigation.from': '/',
        'solid.navigation.outcome': 'committed',
        'url.path.parameter.id': '42',
      }),
    });
    // Backdated to the engine's clock: the segment starts at dispatch, not when the record settled.
    expect(segment!.start_timestamp).toBeLessThanOrEqual(nav!.start_timestamp);
    expect(nav!.end_timestamp!).toBeLessThanOrEqual(segment!.end_timestamp!);
    app.dispose();
  });

  it('targetText keeps the element text in names and attributes', async () => {
    const { client, captured } = clientWith({ targetText: true });
    const app = readerApp();
    OBSERVE!.attribution.withInteraction({ type: 'click', target: 'button#next "Next"' }, () => app.setCount(1));
    flush();
    await settle();
    await client.flush(100);
    const segment = captured.spans.find(span => span.is_segment);
    expect(segment?.name).toBe('click on button#next "Next"');
    expect(segment?.attributes['solid.interaction.target']).toBe('button#next "Next"');
    app.dispose();
  });

  it("a server-function call made under an interaction is the interaction's child, joined by identity", async () => {
    const { client, captured } = clientWith();
    const app = readerApp();
    const live = { args: [1], response: new Response(''), result: 'ok' };

    OBSERVE!.attribution.withInteraction({ type: 'click', target: 'button#save' }, () => {
      app.setCount(1);
      // What the server-function client does at dispatch: the record carries
      // the engine's own interaction frame, read while the handler runs.
      const origin = OBSERVE!.attribution.currentOrigin();
      OBSERVE!.records.emit(
        'call',
        { id: 'saveTodo', method: 'POST', at: performance.now(), durationMs: 12, outcome: 'ok', status: 200, origin },
        live,
      );
    });
    flush();
    await settle();
    await client.flush(100);

    const segment = captured.spans.find(span => span.is_segment);
    const call = captured.spans.find(span => span.attributes['sentry.op'] === 'function.solid.call');
    expect(segment).toBeDefined();
    expect(call).toMatchObject({
      name: 'saveTodo',
      parent_span_id: segment!.span_id,
      trace_id: segment!.trace_id,
      attributes: expect.objectContaining({
        'solid.server_function.method': 'POST',
        'solid.server_function.outcome': 'ok',
        'solid.server_function.origin.kind': 'interaction',
        'http.response.status_code': 200,
        'sentry.origin': 'auto.http.solid.call',
      }),
    });
    app.dispose();
  });

  it("a call that lands after its interaction settled is still the interaction's child, marked after_settle", async () => {
    const { client, captured } = clientWith();
    const app = readerApp();
    let origin: ReturnType<typeof OBSERVE.attribution.currentOrigin>;

    // `onClick={async () => set(await call())}`: the handler makes no
    // synchronous write, so the interaction settles as `idle` at once…
    OBSERVE!.attribution.withInteraction({ type: 'click', target: 'button#save' }, () => {
      origin = OBSERVE!.attribution.currentOrigin();
    });
    flush();
    await settle();
    // …and the call it dispatched lands later, carrying that frame.
    OBSERVE!.records.emit(
      'call',
      { id: 'saveTodo', method: 'POST', at: performance.now(), durationMs: 12, outcome: 'ok', status: 200, origin },
      { args: [1], response: new Response(''), result: 'ok' },
    );
    await settle();
    await client.flush(100);

    const segment = captured.spans.find(
      span => span.is_segment && span.attributes['sentry.op'] === 'ui.interaction.click',
    );
    const call = captured.spans.find(span => span.attributes['sentry.op'] === 'function.solid.call');
    expect(segment).toBeDefined();
    expect(call).toMatchObject({
      parent_span_id: segment!.span_id,
      attributes: expect.objectContaining({ 'solid.server_function.after_settle': true }),
    });
    expect(call!.start_timestamp).toBeGreaterThanOrEqual(segment!.end_timestamp!);
    app.dispose();
  });

  it('a call with no interaction, and a failed one, are root spans; a failure is status only', async () => {
    const { client, captured } = clientWith();
    const boom = new Error('server said no');
    OBSERVE!.records.emit(
      'call',
      { id: 'loadFeed', method: 'GET', at: performance.now(), durationMs: 40, outcome: 'ok', status: 200 },
      { args: [], response: new Response(''), result: [] },
    );
    OBSERVE!.records.emit(
      'call',
      { id: 'deleteTodo', method: 'POST', at: performance.now(), durationMs: 8, outcome: 'error', status: 500 },
      { args: [7], response: new Response('', { status: 500 }), error: boom },
    );
    await settle();
    await client.flush(100);

    const roots = captured.spans.filter(span => span.is_segment);
    expect(roots.map(span => span.name).sort()).toEqual(['deleteTodo', 'loadFeed']);
    const failed = roots.find(span => span.name === 'deleteTodo')!;
    expect(failed.status).toBe('error');
    // The error reached the caller; whatever catches it there reports it. Not here.
    expect(captured.events).toEqual([]);
  });

  it('an applied frame stream is a span with its chunk census; a truncated one is an error', async () => {
    const { client, captured } = clientWith();
    const base = { version: 1, chunks: 5, fragments: 2, slots: 1, regions: 0, errors: 0, durationMs: 30 };
    OBSERVE!.records.emit(
      'frame',
      {
        ...base,
        side: 'client',
        id: 'Comments',
        address: 'f0',
        at: performance.now(),
        shellMs: 4,
        outcome: 'complete',
      },
      { response: new Response('') },
    );
    OBSERVE!.records.emit(
      'frame',
      { ...base, side: 'client', id: 'Sidebar', at: performance.now(), outcome: 'truncated' },
      { response: new Response('') },
    );
    await settle();
    await client.flush(100);

    const frames = captured.spans.filter(span => span.attributes['sentry.op'] === 'solid.frame.apply');
    expect(frames.map(span => span.name).sort()).toEqual(['Comments', 'Sidebar']);
    const complete = frames.find(span => span.name === 'Comments')!;
    expect(complete.attributes).toMatchObject({
      'solid.frame.address': 'f0',
      'solid.frame.chunks': 5,
      'solid.frame.fragments': 2,
      'solid.frame.shellMs': 4,
      'sentry.origin': 'auto.ui.solid.frame',
    });
    expect(frames.find(span => span.name === 'Sidebar')!.status).toBe('error');
  });

  it('a navigation no interaction claims is its own segment', async () => {
    const { client, captured } = clientWith();
    const app = readerApp();

    OBSERVE!.attribution.withOrigin({ kind: 'navigation', name: '/about', to: '/about' }, () => app.setCount(1));
    flush();
    await settle();
    await client.flush(100);

    const segments = captured.spans.filter(span => span.is_segment);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      name: '/about',
      attributes: expect.objectContaining({ 'sentry.op': 'navigation' }),
    });
    app.dispose();
  });

  describe('route names, from the records', () => {
    const routeRef = (initial: boolean) =>
      ({
        kind: 'navigation',
        ...(initial ? { initial: true } : { from: '/' }),
        name: '/users/:id',
        to: '/users/42',
        params: { id: '42' },
      }) as const;

    it('the route the document arrived on renames the pageload span, source route', async () => {
      const { client, captured } = clientWith(undefined, [solidBrowserTracingIntegration()]);
      const pageload = getRootSpan(getActiveSpan()!);
      expect(spanToJSON(pageload).attributes['sentry.op']).toBe('pageload');

      // What the router does as it builds its context: no write, settles at frame close.
      OBSERVE!.attribution.withOrigin(routeRef(true), () => {});
      await settle();

      expect(spanToJSON(pageload).name).toBe('/users/:id');
      expect(getCurrentScope().getScopeData().transactionName).toBe('/users/:id');
      pageload.end();
      await client.flush(100);

      const segment = captured.spans.find(span => span.is_segment && span.attributes['sentry.op'] === 'pageload')!;
      expect(segment).toMatchObject({
        name: '/users/:id',
        attributes: expect.objectContaining({
          'sentry.segment.name.source': 'route',
          'url.template': '/users/:id',
          'url.path.parameter.id': '42',
          'params.id': '42',
        }),
      });
      // The arrival is no navigation: nothing else was painted for it.
      expect(captured.spans.filter(span => span.attributes['sentry.op'] === 'navigation')).toEqual([]);
    });

    it('an arrival without a route pattern leaves the pageload as the browser SDK named it', async () => {
      const { client, captured } = clientWith(undefined, [solidBrowserTracingIntegration()]);
      const pageload = getRootSpan(getActiveSpan()!);
      OBSERVE!.attribution.withOrigin({ kind: 'navigation', initial: true, to: '/somewhere' }, () => {});
      await settle();
      pageload.end();
      await client.flush(100);
      const segment = captured.spans.find(span => span.is_segment && span.attributes['sentry.op'] === 'pageload')!;
      expect(segment.name).not.toBe('/somewhere');
      expect(segment.attributes['sentry.segment.name.source']).not.toBe('route');
    });

    it("beside solidBrowserTracingIntegration a click's navigation is the browser navigation span, and the click links to it", async () => {
      const { client, captured } = clientWith(undefined, [solidBrowserTracingIntegration()]);
      const app = readerApp();
      const at = performance.now();
      OBSERVE!.attribution.withInteraction({ type: 'click', target: 'a#user' }, () =>
        OBSERVE!.attribution.withOrigin(routeRef(false), () => app.setCount(1)),
      );
      flush();
      await settle();
      await client.flush(100);

      const nav = captured.spans.find(span => span.is_segment && span.attributes['sentry.op'] === 'navigation')!;
      const click = captured.spans.find(
        span => span.is_segment && span.attributes['sentry.op'] === 'ui.interaction.click',
      )!;
      expect(nav).toMatchObject({
        name: '/users/:id',
        attributes: expect.objectContaining({
          'sentry.segment.name.source': 'route',
          'url.template': '/users/:id',
          'url.path': '/users/42',
          'url.path.parameter.id': '42',
          'solid.navigation.from': '/',
          'solid.navigation.outcome': 'committed',
          'sentry.origin': 'auto.navigation.solid',
        }),
      });
      // Dated from the write that requested it, ended where the runtime settled it — not the idle timeout.
      expect(nav.start_timestamp).toBeGreaterThanOrEqual((performance.timeOrigin + at) / 1000 - 0.001);
      expect(nav.end_timestamp! - nav.start_timestamp).toBeLessThan(0.5);
      // A root in the trace the navigation opened; the click joins that trace and links to it.
      expect(nav.parent_span_id).toBeUndefined();
      expect(click.trace_id).toBe(nav.trace_id);
      expect(click.links).toEqual([
        expect.objectContaining({
          span_id: nav.span_id,
          attributes: expect.objectContaining({ 'solid.link': 'navigation' }),
        }),
      ]);
      // Not painted twice: the only navigation span is the browser's.
      expect(captured.spans.filter(span => span.attributes['sentry.op'] === 'navigation')).toHaveLength(1);
      app.dispose();
    });

    it('a navigation no interaction claims is the browser navigation span too; the earlier idle span ends', async () => {
      const { client, captured } = clientWith(undefined, [solidBrowserTracingIntegration()]);
      const app = readerApp();
      OBSERVE!.attribution.withOrigin(routeRef(false), () => app.setCount(1));
      flush();
      await settle();
      await client.flush(100);
      const segments = captured.spans.filter(span => span.is_segment);
      expect(segments.map(span => span.attributes['sentry.op']).sort()).toEqual(['navigation', 'pageload']);
      expect(segments.find(span => span.attributes['sentry.op'] === 'navigation')!.name).toBe('/users/:id');
      app.dispose();
    });

    it("a server-function call a navigation caused is the navigation span's child, joined by identity", async () => {
      const { client, captured } = clientWith(undefined, [solidBrowserTracingIntegration()]);
      const app = readerApp();
      OBSERVE!.attribution.withOrigin(routeRef(false), () => {
        app.setCount(1);
        // What a `createAsync` calling the server on the route's write records: the navigation frame.
        const origin = OBSERVE!.attribution.currentOrigin();
        expect(origin?.kind).toBe('navigation');
        OBSERVE!.records.emit(
          'call',
          { id: 'loadUser', method: 'POST', at: performance.now(), durationMs: 9, outcome: 'ok', status: 200, origin },
          { args: [42], response: new Response(''), result: {} },
        );
      });
      flush();
      await settle();
      await client.flush(100);
      const nav = captured.spans.find(span => span.is_segment && span.attributes['sentry.op'] === 'navigation')!;
      const call = captured.spans.find(span => span.attributes['sentry.op'] === 'function.solid.call')!;
      expect(call.parent_span_id).toBe(nav.span_id);
      expect(call.trace_id).toBe(nav.trace_id);
      expect(call.attributes['solid.server_function.origin.kind']).toBe('navigation');
      app.dispose();
    });

    it('a call no frame claims during the load is a child of the pageload span', async () => {
      const { client, captured } = clientWith(undefined, [solidBrowserTracingIntegration()]);
      const pageload = getRootSpan(getActiveSpan()!);
      OBSERVE!.records.emit(
        'call',
        { id: 'loadFeed', method: 'GET', at: performance.now(), durationMs: 4, outcome: 'ok', status: 200 },
        { args: [], response: new Response(''), result: [] },
      );
      await settle();
      pageload.end();
      await client.flush(100);
      const call = captured.spans.find(span => span.attributes['sentry.op'] === 'function.solid.call')!;
      expect(call.is_segment).toBe(false);
      expect(call.parent_span_id).toBe(pageload.spanContext().spanId);
    });

    it('instrumentNavigation: false on the wrapper means no browser navigation span; the record is a span of its own', async () => {
      const { client, captured } = clientWith(undefined, [
        solidBrowserTracingIntegration({ instrumentNavigation: false }),
      ]);
      const app = readerApp();
      OBSERVE!.attribution.withOrigin(routeRef(false), () => app.setCount(1));
      flush();
      await settle();
      await client.flush(100);
      const nav = captured.spans.find(span => span.attributes['sentry.op'] === 'navigation')!;
      expect(nav.attributes['sentry.origin']).toBe('auto.ui.solid.attribution');
      expect(nav.attributes['url.template']).toBeUndefined();
      app.dispose();
    });
  });

  it('reports the runtime diagnostics as issues fingerprinted by code and owner', async () => {
    const { client, captured } = clientWith({ attribution: { hotRuns: { count: 3, windowMs: 10_000 } } });
    const app = readerApp();

    for (let i = 1; i <= 6; i++) {
      app.setCount(i);
      flush();
    }
    await settle();
    await client.flush(100);

    const issue = captured.events.find(event => event.tags?.['solid.code'] === 'HOT_SCOPE_RERUNS');
    expect(issue).toBeDefined();
    expect(issue!.level).toBe('warning');
    expect(issue!.fingerprint?.[0]).toBe('HOT_SCOPE_RERUNS');
    expect(issue!.message).toContain('HOT_SCOPE_RERUNS');
    expect(issue!.tags?.['solid.node']).toBe('reader');
    app.dispose();
  });

  it('with diagnostics off, findings stay on the channel', async () => {
    const { client, captured } = clientWith({
      diagnostics: false,
      attribution: { hotRuns: { count: 3, windowMs: 10_000 } },
    });
    const app = readerApp();
    for (let i = 1; i <= 6; i++) {
      app.setCount(i);
      flush();
    }
    await settle();
    await client.flush(100);
    expect(captured.events).toEqual([]);
    app.dispose();
  });
});

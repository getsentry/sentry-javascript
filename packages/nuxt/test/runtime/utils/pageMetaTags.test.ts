import { getTraceMetaTags } from '@sentry/core';
import { _INTERNAL_getRootSpanSentryTrace } from '@sentry/core/server';
import type { H3Event } from 'h3';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import {
  addSentryPageMetaTags,
  NUXT_NITRO_PRESET_FLAG,
  recordRequestStart,
} from '../../../src/runtime/utils/pageMetaTags';

vi.mock(import('@sentry/core'), async importOriginal => {
  const mod = await importOriginal();
  return {
    ...mod,
    getTraceMetaTags: vi.fn(),
  };
});

vi.mock(import('@sentry/core/server'), async importOriginal => ({
  ...(await importOriginal()),
  _INTERNAL_getRootSpanSentryTrace: vi.fn(),
}));

const SENTRY_TRACE = '4c79f60c11214eb38604f4ae0781bfb2-fa90fdead5f74052-1';
const LIVE_TRACE_META_TAGS = [
  `<meta name="sentry-trace" content="${SENTRY_TRACE}"/>`,
  '<meta name="baggage" content="sentry-environment=production,sentry-trace_id=4c79f60c11214eb38604f4ae0781bfb2"/>',
].join('\n');

const REQUEST_START = 1_700_000_000;

// No span is active, so the render start is the request start.
function cacheOriginMetaTags(cacheOrigin: string): string {
  return `<meta name="sentry-cache-origin" content="${cacheOrigin}"/>\n<meta name="sentry-render-start" content="${REQUEST_START}"/>`;
}

const PATH = '/rendering-modes/swr-cached-page';

// h3 v1 (Nitro v2): Node request, with web `Headers` built from it. The Nuxt renderer resolves the
// route rules.
function h3v1Event(routeRules: Record<string, unknown> = {}, headers: Record<string, string> = {}): H3Event {
  const nodeReq = { url: PATH, headers };
  return {
    path: PATH,
    node: { req: nodeReq },
    get headers() {
      return new Headers(nodeReq.headers);
    },
    context: { _nitro: { routeRules }, _sentryRequestStart: REQUEST_START },
  } as unknown as H3Event;
}

// h3 v2 (Nitro v3): web `Request`, route rules stored by name.
function h3v2Event(routeRules: Record<string, unknown> = {}, headers: Record<string, string> = {}): H3Event {
  const url = `https://shop.example.com${PATH}`;
  const req = new Request(url, { headers });
  return {
    req,
    url: new URL(url),
    get headers() {
      return req.headers;
    },
    context: { routeRules, _sentryRequestStart: REQUEST_START },
  } as unknown as H3Event;
}

function nitroV3Rule(name: string, options: unknown): Record<string, unknown> {
  return { [name]: { name, route: PATH, options, params: {} } };
}

describe('addSentryPageMetaTags', () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('adds the tracing meta tags to a page rendered for one request', () => {
    (getTraceMetaTags as Mock).mockReturnValue(LIVE_TRACE_META_TAGS);
    const head: string[] = [];

    addSentryPageMetaTags(head, h3v1Event());

    expect(head).toEqual([LIVE_TRACE_META_TAGS]);
  });

  it.each([
    { nitro: 'Nitro v2', event: h3v1Event({ cache: { swr: true, maxAge: 3600 } }) },
    { nitro: 'Nitro v3', event: h3v2Event(nitroV3Rule('cache', { swr: true, maxAge: 3600 })) },
  ])('replaces the tracing meta tags with the render as cache origin on a cached route ($nitro)', ({ event }) => {
    (_INTERNAL_getRootSpanSentryTrace as Mock).mockReturnValue(SENTRY_TRACE);
    const head: string[] = [];

    addSentryPageMetaTags(head, event);

    expect(head).toEqual([cacheOriginMetaTags(SENTRY_TRACE)]);
  });

  it('adds the tracing meta tags when the route opts out of caching with `cache: false`', () => {
    (getTraceMetaTags as Mock).mockReturnValue(LIVE_TRACE_META_TAGS);
    const head: string[] = [];

    addSentryPageMetaTags(head, h3v1Event({ cache: false }));

    expect(head).toEqual([LIVE_TRACE_META_TAGS]);
  });

  it('uses the given trace data of the request for the cache origin', () => {
    const storedSentryTrace = '0d5c7c7a6f0b4a57a3f1e9c2b8d4e6f1-b1a2c3d4e5f60718-1';
    const head: string[] = [];

    addSentryPageMetaTags(head, h3v1Event({ cache: {} }), { 'sentry-trace': storedSentryTrace });

    expect(head).toEqual([cacheOriginMetaTags(storedSentryTrace)]);
    expect(_INTERNAL_getRootSpanSentryTrace).not.toHaveBeenCalled();
  });

  it('adds an empty cache origin tag to a cached route when the server has no trace data', () => {
    (_INTERNAL_getRootSpanSentryTrace as Mock).mockReturnValue(undefined);
    const head: string[] = [];

    addSentryPageMetaTags(head, h3v1Event({ cache: {} }));

    expect(head).toEqual([cacheOriginMetaTags('')]);
  });

  it.each([
    { nitro: 'Nitro v2', event: h3v1Event({}, { 'x-nitro-prerender': PATH }) },
    { nitro: 'Nitro v3', event: h3v2Event({}, { 'x-nitro-prerender': PATH }) },
  ])('adds an empty cache origin tag to a page prerendered during the build ($nitro)', ({ event }) => {
    const head: string[] = [];

    addSentryPageMetaTags(head, event, { 'sentry-trace': SENTRY_TRACE });

    expect(head).toEqual([cacheOriginMetaTags('')]);
  });

  it('adds the tracing meta tags when the event has no `headers` getter', () => {
    (getTraceMetaTags as Mock).mockReturnValue(LIVE_TRACE_META_TAGS);
    const head: string[] = [];

    addSentryPageMetaTags(head, { context: { routeRules: {} } } as unknown as H3Event);

    expect(head).toEqual([LIVE_TRACE_META_TAGS]);
  });

  it.each(['vercel', 'netlify'])('replaces the tracing meta tags on an `isr` route on the %s preset', preset => {
    vi.stubGlobal(NUXT_NITRO_PRESET_FLAG, preset);
    (_INTERNAL_getRootSpanSentryTrace as Mock).mockReturnValue(SENTRY_TRACE);
    const head: string[] = [];

    addSentryPageMetaTags(head, h3v1Event({ isr: 3600 }));

    expect(head).toEqual([cacheOriginMetaTags(SENTRY_TRACE)]);
  });

  it.each([
    { preset: 'node-server', description: 'a preset without a platform cache' },
    { preset: 'vercel-edge', description: 'the Vercel edge preset, which has no ISR functions' },
    { preset: undefined, description: 'an unknown preset' },
  ])('adds the tracing meta tags to an `isr` route on $description', ({ preset }) => {
    vi.stubGlobal(NUXT_NITRO_PRESET_FLAG, preset);
    (getTraceMetaTags as Mock).mockReturnValue(LIVE_TRACE_META_TAGS);
    const head: string[] = [];

    addSentryPageMetaTags(head, h3v2Event(nitroV3Rule('isr', true)));

    expect(head).toEqual([LIVE_TRACE_META_TAGS]);
  });
});

describe('recordRequestStart', () => {
  it('records the request start that the cache origin tags of the page use', () => {
    const event = h3v1Event({ cache: {} });
    (_INTERNAL_getRootSpanSentryTrace as Mock).mockReturnValue(SENTRY_TRACE);
    const before = Date.now() / 1000;

    recordRequestStart(event);
    const requestStart = (event.context as { _sentryRequestStart?: number })._sentryRequestStart;
    const head: string[] = [];
    addSentryPageMetaTags(head, event);

    expect(requestStart).toBeGreaterThanOrEqual(Math.floor(before));
    expect(head).toEqual([
      `<meta name="sentry-cache-origin" content="${SENTRY_TRACE}"/>\n<meta name="sentry-render-start" content="${Math.floor(requestStart!)}"/>`,
    ]);
  });
});

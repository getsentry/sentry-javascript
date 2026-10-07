import { context, propagation } from '@opentelemetry/api';
import { getCurrentScope, setCurrentClient, startSpan } from '@sentry/core';
import { NodeClient, getDefaultIntegrations } from '@sentry/node';
import { SentryPropagator } from '@sentry/opentelemetry';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../../src/common/nextSpanAttributes';
import {
  NextSentryPropagator,
  isPrerenderSpan,
  registerNextSentryPropagator,
} from '../../src/server/nextSentryPropagator';

function injectedKeys(propagator: SentryPropagator): string[] {
  const carrier: Record<string, string> = {};
  propagator.inject(context.active(), carrier, {
    set: (c, key, value) => ((c as Record<string, string>)[key] = value),
  });
  return Object.keys(carrier);
}

describe('NextSentryPropagator', () => {
  beforeEach(() => {
    const client = new NodeClient({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
      integrations: getDefaultIntegrations({}),
      stackParser: () => [],
      transport: () => ({ send: () => Promise.resolve({}), flush: () => Promise.resolve(true) }),
    });
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
    vi.restoreAllMocks();
  });

  it('hands out trace context while a route is rendered for a request', () => {
    const propagator = new NextSentryPropagator();

    startSpan(
      {
        name: 'render route (app) /blocking',
        attributes: {
          [ATTR_NEXT_SPAN_TYPE]: 'AppRender.getBodyResult',
          [ATTR_NEXT_SPAN_NAME]: 'render route (app) /blocking',
        },
      },
      span => {
        expect(isPrerenderSpan(span)).toBe(false);
        expect(injectedKeys(propagator)).toEqual(expect.arrayContaining(['sentry-trace', 'baggage']));
      },
    );
  });

  it('hands out nothing while a route is prerendered', () => {
    const propagator = new NextSentryPropagator();

    startSpan(
      {
        name: 'prerender route (app) /[id]',
        attributes: {
          [ATTR_NEXT_SPAN_TYPE]: 'AppRender.getBodyResult',
          [ATTR_NEXT_SPAN_NAME]: 'prerender route (app) /[id]',
        },
      },
      span => {
        expect(isPrerenderSpan(span)).toBe(true);
        expect(injectedKeys(propagator)).toEqual([]);
      },
    );
  });

  it('does not mistake other Next.js spans for a prerender', () => {
    startSpan(
      {
        name: 'prerender route (app) /x',
        attributes: { [ATTR_NEXT_SPAN_TYPE]: 'NextNodeServer.getLayoutOrPageModule' },
      },
      span => expect(isPrerenderSpan(span)).toBe(false),
    );
    expect(isPrerenderSpan(undefined)).toBe(false);
  });

  it('replaces the registered global propagator', () => {
    propagation.setGlobalPropagator(new SentryPropagator());

    registerNextSentryPropagator();

    const carrier: Record<string, string> = {};
    const injectSpy = vi.spyOn(NextSentryPropagator.prototype, 'inject');
    propagation.inject(context.active(), carrier);
    expect(injectSpy).toHaveBeenCalledTimes(1);
    propagation.disable();
  });
});

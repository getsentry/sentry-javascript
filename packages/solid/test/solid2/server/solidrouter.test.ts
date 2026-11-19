import {
  HTTP_REQUEST_METHOD,
  HTTP_ROUTE,
  SENTRY_OP,
  SENTRY_SEGMENT_NAME_SOURCE,
  URL_PATH,
  URL_PATH_PARAMETER_KEY_BASE,
} from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import { createTransport, getCurrentScope, setCurrentClient, spanToJSON, startSpan } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { createRouter } from '@solidjs/router';
import { renderToString } from '@solidjs/web';
import { createComponent } from 'solid-js';
import { beforeEach, describe, expect, it } from 'vitest';
import { withSentryRouterRouting } from '../../../src/solid2/solidrouter';

const routes = [
  { path: '/', component: () => 'Home' },
  { path: '/user/:id', component: () => 'User' },
];

function renderAt(url: string, op: string): { span: Span; transactionName: string | undefined } {
  const Router = withSentryRouterRouting(createRouter({ routes }));

  return startSpan({ name: 'GET', op, forceTransaction: true }, span => {
    renderToString(() => createComponent(Router, { url }));
    return { span, transactionName: getCurrentScope().getScopeData().transactionName };
  });
}

describe('withSentryRouterRouting (server)', () => {
  beforeEach(() => {
    getCurrentScope().setClient(undefined);
    const client = new NodeClient({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
      integrations: [],
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
      stackParser: () => [],
    });
    setCurrentClient(client);
    client.init();
  });

  it('names the http.server span after the matched route', () => {
    const { span, transactionName } = renderAt('http://localhost/user/5', HTTP_SERVER);

    expect(spanToJSON(span).name).toBe('GET /user/:id');
    expect(spanToJSON(span).attributes).toMatchObject({
      [HTTP_ROUTE]: '/user/:id',
      [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
      [`${URL_PATH_PARAMETER_KEY_BASE}.id`]: '5',
    });
    expect(transactionName).toBe('GET /user/:id');
  });

  it('names the http.server span as soon as it starts, before the page renders', () => {
    withSentryRouterRouting(createRouter({ routes }));

    const nameAtStart = startSpan(
      {
        name: 'GET',
        forceTransaction: true,
        attributes: { [SENTRY_OP]: HTTP_SERVER, [URL_PATH]: '/user/7', [HTTP_REQUEST_METHOD]: 'POST' },
      },
      span => spanToJSON(span).name,
    );

    expect(nameAtStart).toBe('POST /user/:id');
  });

  it('names the root route `/`', () => {
    const { span } = renderAt('http://localhost/', HTTP_SERVER);

    expect(spanToJSON(span).name).toBe('GET /');
    expect(spanToJSON(span).attributes?.[HTTP_ROUTE]).toBe('/');
  });

  it('leaves the span alone when no route matches', () => {
    const { span } = renderAt('http://localhost/missing', HTTP_SERVER);

    expect(spanToJSON(span).name).toBe('GET');
  });

  it('leaves spans other than http.server alone', () => {
    const { span } = renderAt('http://localhost/user/5', 'function');

    expect(spanToJSON(span).name).toBe('GET');
  });
});

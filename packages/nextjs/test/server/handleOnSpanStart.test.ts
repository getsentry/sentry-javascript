import { HTTP_ROUTE, SENTRY_OP, SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import type { Client } from '@sentry/core';
import { addChildSpanToSpan, SentrySpan, spanToStaticSpanJSON } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { handleOnSpanStart } from '../../src/server/handleOnSpanStart';

const client = { getOptions: () => ({}) } as unknown as Client;

describe('handleOnSpanStart', () => {
  it('names the root span after the middleware when Next.js started the root span', () => {
    const middlewareSpan = new SentrySpan({
      sampled: true,
      name: 'middleware GET',
      attributes: { 'next.span_type': 'Middleware.execute', 'next.span_name': 'middleware GET' },
    });

    handleOnSpanStart(middlewareSpan, client);

    const { description, data } = spanToStaticSpanJSON(middlewareSpan);
    expect(description).toBe('middleware GET');
    expect(data[HTTP_ROUTE]).toBe('middleware GET');
  });

  it('names a root span that another SDK started after the middleware and marks the middleware span', () => {
    const rootSpan = new SentrySpan({ sampled: true, name: 'GET', attributes: { 'http.request.method': 'GET' } });
    const middlewareSpan = new SentrySpan({
      sampled: true,
      name: 'middleware GET',
      attributes: { 'next.span_type': 'Middleware.execute', 'next.span_name': 'middleware GET' },
    });
    addChildSpanToSpan(rootSpan, middlewareSpan);

    handleOnSpanStart(middlewareSpan, client);

    const root = spanToStaticSpanJSON(rootSpan);
    expect(root.description).toBe('middleware GET');
    expect(root.data[SENTRY_SEGMENT_NAME_SOURCE]).toBe('route');
    expect(root.data[HTTP_ROUTE]).toBeUndefined();
    expect(spanToStaticSpanJSON(middlewareSpan).data[SENTRY_OP]).toBe('middleware');
  });

  it('names a root span that another SDK started after the route once a route span starts behind the middleware', () => {
    const rootSpan = new SentrySpan({ sampled: true, name: 'GET', attributes: { 'http.request.method': 'GET' } });
    const middlewareSpan = new SentrySpan({
      sampled: true,
      name: 'middleware GET',
      attributes: { 'next.span_type': 'Middleware.execute', 'next.span_name': 'middleware GET' },
    });
    const routeSpan = new SentrySpan({
      sampled: true,
      name: 'executing api route (app) /api/endpoint/route',
      attributes: { 'next.span_type': 'AppRouteRouteHandlers.runHandler', 'next.route': '/api/endpoint/route' },
    });
    addChildSpanToSpan(rootSpan, middlewareSpan);
    addChildSpanToSpan(rootSpan, routeSpan);

    handleOnSpanStart(middlewareSpan, client);
    handleOnSpanStart(routeSpan, client);

    const root = spanToStaticSpanJSON(rootSpan);
    expect(root.description).toBe('GET /api/endpoint');
    expect(root.data[HTTP_ROUTE]).toBe('/api/endpoint');
    expect(root.data[SENTRY_SEGMENT_NAME_SOURCE]).toBe('route');
  });

  it('keeps the middleware name of a root span that another SDK started when Next.js renders an error page', () => {
    const rootSpan = new SentrySpan({ sampled: true, name: 'GET', attributes: { 'http.request.method': 'GET' } });
    const middlewareSpan = new SentrySpan({
      sampled: true,
      name: 'middleware GET',
      attributes: { 'next.span_type': 'Middleware.execute', 'next.span_name': 'middleware GET' },
    });
    const errorPageSpan = new SentrySpan({
      sampled: true,
      name: 'resolve page components',
      attributes: { 'next.span_type': 'NextNodeServer.findPageComponents', 'next.route': '/500' },
    });
    addChildSpanToSpan(rootSpan, middlewareSpan);
    addChildSpanToSpan(rootSpan, errorPageSpan);

    handleOnSpanStart(middlewareSpan, client);
    handleOnSpanStart(errorPageSpan, client);

    const root = spanToStaticSpanJSON(rootSpan);
    expect(root.description).toBe('middleware GET');
    expect(root.data[HTTP_ROUTE]).toBeUndefined();
  });

  it('names a root span that another SDK started after an error page when no middleware ran', () => {
    const rootSpan = new SentrySpan({ sampled: true, name: 'GET', attributes: { 'http.request.method': 'GET' } });
    const errorPageSpan = new SentrySpan({
      sampled: true,
      name: 'resolve page components',
      attributes: { 'next.span_type': 'NextNodeServer.findPageComponents', 'next.route': '/500' },
    });
    addChildSpanToSpan(rootSpan, errorPageSpan);

    handleOnSpanStart(errorPageSpan, client);

    expect(spanToStaticSpanJSON(rootSpan).description).toBe('GET /500');
  });

  it('names a root span that another SDK started after the 404 page behind the middleware', () => {
    const rootSpan = new SentrySpan({ sampled: true, name: 'GET', attributes: { 'http.request.method': 'GET' } });
    const middlewareSpan = new SentrySpan({
      sampled: true,
      name: 'middleware GET',
      attributes: { 'next.span_type': 'Middleware.execute', 'next.span_name': 'middleware GET' },
    });
    const notFoundPageSpan = new SentrySpan({
      sampled: true,
      name: 'resolve page components',
      attributes: { 'next.span_type': 'NextNodeServer.findPageComponents', 'next.route': '/_not-found' },
    });
    addChildSpanToSpan(rootSpan, middlewareSpan);
    addChildSpanToSpan(rootSpan, notFoundPageSpan);

    handleOnSpanStart(middlewareSpan, client);
    handleOnSpanStart(notFoundPageSpan, client);

    const root = spanToStaticSpanJSON(rootSpan);
    expect(root.description).toBe('GET /_not-found');
    expect(root.data[HTTP_ROUTE]).toBe('/_not-found');
  });

  it('keeps the route of a root span that another SDK started when the middleware starts', () => {
    const rootSpan = new SentrySpan({
      sampled: true,
      name: 'GET /api/endpoint',
      attributes: { 'http.request.method': 'GET', [HTTP_ROUTE]: '/api/endpoint' },
    });
    const middlewareSpan = new SentrySpan({
      sampled: true,
      name: 'middleware GET',
      attributes: { 'next.span_type': 'Middleware.execute', 'next.span_name': 'middleware GET' },
    });
    addChildSpanToSpan(rootSpan, middlewareSpan);

    handleOnSpanStart(middlewareSpan, client);

    expect(spanToStaticSpanJSON(rootSpan).description).toBe('GET /api/endpoint');
  });
});

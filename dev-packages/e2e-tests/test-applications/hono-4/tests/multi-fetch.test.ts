import { expect, test } from '@playwright/test';
import {
  waitForError,
  waitForStreamedSpan,
  getSpanOp,
  collectStreamedSpansUntilSegment,
} from '@sentry-internal/test-utils';
import { APP_NAME } from './constants';

const STOREFRONT = '/test-multi-fetch/storefront';
const INVENTORY = '/test-multi-fetch/inventory';

test.describe('multi-fetch: internal .request() calls between sub-apps', () => {
  test.describe('single internal fetch', () => {
    test('returns enriched product data and creates span with parameterized route', async ({ baseURL }) => {
      const segmentPromise = waitForStreamedSpan(
        APP_NAME,
        segment =>
          segment.is_segment &&
          getSpanOp(segment) === 'http.server' &&
          segment.name === `GET ${STOREFRONT}/product/:productId`,
      );

      const response = await fetch(`${baseURL}${STOREFRONT}/product/self-watering-plant`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.product).toEqual(
        expect.objectContaining({
          productId: 'self-watering-plant',
          name: 'Self-Watering Plant',
          stock: 5,
          price: 2500,
        }),
      );
      expect(body.source).toBe('storefront');

      const segment = await segmentPromise;
      expect(segment.name).toBe(`GET ${STOREFRONT}/product/:productId`);
      expect(getSpanOp(segment)).toBe('http.server');
    });

    test('creates storefrontAuth middleware span', async ({ baseURL }) => {
      const segmentPromise = collectStreamedSpansUntilSegment(
        APP_NAME,
        segment => getSpanOp(segment) === 'http.server' && segment.name === `GET ${STOREFRONT}/product/:productId`,
      );

      const response = await fetch(`${baseURL}${STOREFRONT}/product/solar-powered-cyberdeck`);
      expect(response.status).toBe(200);

      const segmentSpans = await segmentPromise;
      const segment = segmentSpans.find(
        segment =>
          segment.is_segment &&
          getSpanOp(segment) === 'http.server' &&
          segment.name === `GET ${STOREFRONT}/product/:productId`,
      )!;
      const spans = segmentSpans.filter(
        span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
      );

      const middlewareSpan = spans.find(span => getSpanOp(span) === 'middleware' && span.name === 'storefrontAuth');

      expect(middlewareSpan).toEqual(
        expect.objectContaining({
          name: 'storefrontAuth',
          attributes: expect.objectContaining({
            'sentry.op': { value: 'middleware', type: 'string' },
            'sentry.origin': { value: 'auto.middleware.hono', type: 'string' },
          }),
        }),
      );
      expect(middlewareSpan?.status).not.toBe('error');
    });
  });

  test.describe('parallel internal fetches', () => {
    test('aggregates data from two concurrent .request() calls', async ({ baseURL }) => {
      const segmentPromise = waitForStreamedSpan(
        APP_NAME,
        segment =>
          segment.is_segment &&
          getSpanOp(segment) === 'http.server' &&
          segment.name === `GET ${STOREFRONT}/compare/:productId1/:productId2`,
      );

      const response = await fetch(`${baseURL}${STOREFRONT}/compare/self-watering-plant/solar-powered-cyberdeck`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.items).toHaveLength(2);
      expect(body.items[0].productId).toBe('self-watering-plant');
      expect(body.items[1].productId).toBe('solar-powered-cyberdeck');
      expect(body.priceDifference).toBe(2500);

      const segment = await segmentPromise;
      expect(segment.name).toBe(`GET ${STOREFRONT}/compare/:productId1/:productId2`);
    });
  });

  test.describe('sequential chained fetches', () => {
    test('composes data from item lookup followed by stock check', async ({ baseURL }) => {
      const segmentPromise = waitForStreamedSpan(
        APP_NAME,
        segment =>
          segment.is_segment &&
          getSpanOp(segment) === 'http.server' &&
          segment.name === `GET ${STOREFRONT}/product/:productId/availability`,
      );

      const response = await fetch(`${baseURL}${STOREFRONT}/product/self-watering-plant/availability`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toEqual({ product: 'Self-Watering Plant', available: true, quantity: 5 });

      const segment = await segmentPromise;
      expect(segment.name).toBe(`GET ${STOREFRONT}/product/:productId/availability`);
      expect(getSpanOp(segment)).toBe('http.server');
    });

    test('reports out-of-stock item as unavailable', async ({ baseURL }) => {
      const segmentPromise = waitForStreamedSpan(
        APP_NAME,
        segment =>
          segment.is_segment &&
          getSpanOp(segment) === 'http.server' &&
          segment.name === `GET ${STOREFRONT}/product/:productId/availability`,
      );

      const response = await fetch(`${baseURL}${STOREFRONT}/product/solar-powered-cyberdeck/availability`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toEqual({ product: 'Solar-Powered Cyberdeck', available: false, quantity: 0 });

      await segmentPromise;
    });
  });

  test.describe('error propagation from internal fetch', () => {
    test('captures error when handler throws after failed internal .request()', async ({ baseURL }) => {
      const errorPromise = waitForError(APP_NAME, event => {
        return event.exception?.values?.[0]?.value === 'Failed to fetch product: nonexistent';
      });

      const segmentPromise = waitForStreamedSpan(
        APP_NAME,
        segment =>
          segment.is_segment &&
          getSpanOp(segment) === 'http.server' &&
          segment.name === `GET ${STOREFRONT}/product-or-throw/:productId`,
      );

      const response = await fetch(`${baseURL}${STOREFRONT}/product-or-throw/nonexistent`);
      expect(response.status).toBe(500);

      const errorEvent = await errorPromise;
      expect(errorEvent.exception?.values?.[0]?.value).toBe('Failed to fetch product: nonexistent');
      expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual(expect.objectContaining({ handled: false }));
      expect(errorEvent.transaction).toBe(`GET ${STOREFRONT}/product-or-throw/:productId`);

      const segment = await segmentPromise;
      expect(segment.name).toBe(`GET ${STOREFRONT}/product-or-throw/:productId`);
      expect(segment?.status).toBe('error');
    });

    test('error event includes request data', async ({ baseURL }) => {
      const errorPromise = waitForError(APP_NAME, event => {
        return event.exception?.values?.[0]?.value === 'Failed to fetch product: missing';
      });

      await fetch(`${baseURL}${STOREFRONT}/product-or-throw/missing`);

      const errorEvent = await errorPromise;
      expect(errorEvent.request).toEqual(
        expect.objectContaining({
          method: 'GET',
          url: expect.stringContaining(`${STOREFRONT}/product-or-throw/missing`),
        }),
      );
    });
  });

  test.describe('inventory sub-app direct access', () => {
    test('creates its own span when accessed directly via HTTP', async ({ baseURL }) => {
      const segmentPromise = waitForStreamedSpan(
        APP_NAME,
        segment =>
          segment.is_segment &&
          getSpanOp(segment) === 'http.server' &&
          segment.name === `GET ${INVENTORY}/item/:productId`,
      );

      const response = await fetch(`${baseURL}${INVENTORY}/item/self-watering-plant`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toEqual(expect.objectContaining({ productId: 'self-watering-plant', name: 'Self-Watering Plant' }));

      const segment = await segmentPromise;
      expect(segment.name).toBe(`GET ${INVENTORY}/item/:productId`);
      expect(getSpanOp(segment)).toBe('http.server');
    });
  });

  test.describe('trace propagation through internal .request() calls', () => {
    test('single internal fetch produces an internal-request child span', async ({ baseURL }) => {
      const segmentPromise = collectStreamedSpansUntilSegment(
        APP_NAME,
        segment => getSpanOp(segment) === 'http.server' && segment.name === `GET ${STOREFRONT}/product/:productId`,
      );

      await fetch(`${baseURL}${STOREFRONT}/product/self-watering-plant`);

      const segmentSpans = await segmentPromise;
      const segment = segmentSpans.find(
        segment =>
          segment.is_segment &&
          getSpanOp(segment) === 'http.server' &&
          segment.name === `GET ${STOREFRONT}/product/:productId`,
      )!;
      const traceId = segment?.trace_id;
      const spans = segmentSpans.filter(
        span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
      );

      const internalRequestSpans = spans.filter(
        s => s.attributes['sentry.origin']?.value === 'auto.http.hono.internal_request',
      );

      expect(internalRequestSpans).toHaveLength(1);
      expect(internalRequestSpans[0]).toEqual(
        expect.objectContaining({
          trace_id: traceId,
          attributes: expect.objectContaining({
            'sentry.op': { value: 'http.server', type: 'string' },
            'sentry.origin': { value: 'auto.http.hono.internal_request', type: 'string' },
          }),
        }),
      );
      expect(internalRequestSpans[0].name).toContain('GET /item/self-watering-plant');
    });

    test('parallel internal fetches produce two sibling internal-request spans', async ({ baseURL }) => {
      const segmentPromise = collectStreamedSpansUntilSegment(
        APP_NAME,
        segment =>
          getSpanOp(segment) === 'http.server' && segment.name === `GET ${STOREFRONT}/compare/:productId1/:productId2`,
      );

      await fetch(`${baseURL}${STOREFRONT}/compare/self-watering-plant/solar-powered-cyberdeck`);

      const segmentSpans = await segmentPromise;
      const segment = segmentSpans.find(
        segment =>
          segment.is_segment &&
          getSpanOp(segment) === 'http.server' &&
          segment.name === `GET ${STOREFRONT}/compare/:productId1/:productId2`,
      )!;
      const traceId = segment?.trace_id;
      const spans = segmentSpans.filter(
        span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
      );

      const internalRequestSpans = spans.filter(
        s => s.attributes['sentry.origin']?.value === 'auto.http.hono.internal_request',
      );

      expect(internalRequestSpans).toHaveLength(2);

      expect(internalRequestSpans[0]?.parent_span_id).toBe(internalRequestSpans[1]?.parent_span_id);

      expect(internalRequestSpans[0]?.trace_id).toBe(traceId);
      expect(internalRequestSpans[1]?.trace_id).toBe(traceId);

      expect(internalRequestSpans[0].attributes['sentry.origin']?.value).toBe('auto.http.hono.internal_request');
      expect(internalRequestSpans[1].attributes['sentry.origin']?.value).toBe('auto.http.hono.internal_request');
    });

    test('sequential chained fetches produce two ordered internal-request spans', async ({ baseURL }) => {
      const segmentPromise = collectStreamedSpansUntilSegment(
        APP_NAME,
        segment =>
          getSpanOp(segment) === 'http.server' && segment.name === `GET ${STOREFRONT}/product/:productId/availability`,
      );

      await fetch(`${baseURL}${STOREFRONT}/product/self-watering-plant/availability`);

      const segmentSpans = await segmentPromise;
      const segment = segmentSpans.find(
        segment =>
          segment.is_segment &&
          getSpanOp(segment) === 'http.server' &&
          segment.name === `GET ${STOREFRONT}/product/:productId/availability`,
      )!;
      const traceId = segment?.trace_id;
      const spans = segmentSpans.filter(
        span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
      );

      const internalRequestSpans = spans
        .filter(s => s.attributes['sentry.origin']?.value === 'auto.http.hono.internal_request')
        .sort(
          (a: { start_timestamp?: number }, b: { start_timestamp?: number }) =>
            (a.start_timestamp ?? 0) - (b.start_timestamp ?? 0),
        );

      expect(internalRequestSpans).toHaveLength(2);

      // Sequential: second span starts at or after first span ends (with tolerance for clock precision)
      expect(internalRequestSpans[1].start_timestamp).toBeGreaterThanOrEqual(
        internalRequestSpans[0].end_timestamp! - 0.001,
      );

      expect(internalRequestSpans[0]?.trace_id).toBe(traceId);
      expect(internalRequestSpans[1]?.trace_id).toBe(traceId);
    });

    test('internal-request span has no error status for internal 4xx HTTPException', async ({ baseURL }) => {
      const segmentPromise = collectStreamedSpansUntilSegment(
        APP_NAME,
        segment =>
          getSpanOp(segment) === 'http.server' && segment.name === `GET ${STOREFRONT}/product-or-throw/:productId`,
      );

      await fetch(`${baseURL}${STOREFRONT}/product-or-throw/ghost`);

      const segmentSpans = await segmentPromise;
      const segment = segmentSpans.find(
        segment =>
          segment.is_segment &&
          getSpanOp(segment) === 'http.server' &&
          segment.name === `GET ${STOREFRONT}/product-or-throw/:productId`,
      )!;
      const spans = segmentSpans.filter(
        span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
      );

      const internalRequestSpans = spans.filter(
        s => s.attributes['sentry.origin']?.value === 'auto.http.hono.internal_request',
      );

      expect(internalRequestSpans).toHaveLength(1);
      expect(internalRequestSpans[0]?.status).not.toBe('error');
    });

    test('error from failed internal fetch is correlated with the storefront trace', async ({ baseURL }) => {
      const errorPromise = waitForError(APP_NAME, event => {
        return event.exception?.values?.[0]?.value === 'Failed to fetch product: ghost';
      });

      const segmentPromise = waitForStreamedSpan(
        APP_NAME,
        segment =>
          segment.is_segment &&
          getSpanOp(segment) === 'http.server' &&
          segment.name === `GET ${STOREFRONT}/product-or-throw/:productId`,
      );

      await fetch(`${baseURL}${STOREFRONT}/product-or-throw/ghost`);

      const [errorEvent, segment] = await Promise.all([errorPromise, segmentPromise]);

      expect(errorEvent.contexts?.trace?.trace_id).toBe(segment?.trace_id);
      expect(errorEvent.contexts?.trace?.span_id).toBeDefined();
    });
  });
});

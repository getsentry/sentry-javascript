import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';
import { join } from 'node:path';
import { findSegmentSpan, findExpressSpan } from '../helpers';

describe('express tracing', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });
  createEsmAndCjsTests(join(__dirname, '..'), 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    let scenario: ReturnType<typeof runScenario> | undefined;
    async function runScenario(
      paths = [
        '/test/express',
        '/test/router/user/123',
        '/test/regex',
        '/test/router/user/42',
        '/test/version/v1/user',
        '/',
      ],
      expectError = false,
    ) {
      const runner = createRunner().unordered();
      const collectors = paths.map(
        path =>
          [path, runner.collectStreamedSpansUntilSegment(span => span.attributes['url.path']?.value === path)] as const,
      );
      const started = runner.start();
      for (const path of paths) {
        await started.makeRequest('get', path, { expectError });
      }
      await started.completed();
      return new Map(await Promise.all(collectors.map(async ([path, spans]) => [path, await spans] as const)));
    }
    async function getSpans(path: string) {
      scenario ??= runScenario();
      return (await scenario).get(path)!;
    }

    test('should create and send segment spans for Express routes and spans for middlewares.', async () => {
      const container = { items: await getSpans('/test/express') };

      const serverSpan = findSegmentSpan(container);

      expect(serverSpan).toMatchObject({
        name: 'GET /test/express',
        span_id: expect.stringMatching(/[a-f\d]{16}/),
        trace_id: expect.stringMatching(/[a-f\d]{32}/),
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'http.server' },
          'url.full': { type: 'string', value: expect.stringMatching(/\/test\/express$/) },
          'http.response.status_code': { type: 'integer', value: 200 },
        }),
      });

      expect(container.items).toContainEqual(
        expect.objectContaining({
          name: 'corsMiddleware',
          attributes: expect.objectContaining({
            'express.name': { type: 'string', value: 'corsMiddleware' },
            'express.type': { type: 'string', value: 'middleware' },
            'sentry.op': { type: 'string', value: 'middleware' },
            'sentry.origin': { type: 'string', value: 'auto.http.express' },
          }),
        }),
      );

      expect(container.items).toContainEqual(
        expect.objectContaining({
          name: '/test/express',
          attributes: expect.objectContaining({
            'express.name': { type: 'string', value: '/test/express' },
            'express.type': { type: 'string', value: 'request_handler' },
            'sentry.op': { type: 'string', value: 'handler' },
            'sentry.origin': { type: 'string', value: 'auto.http.express' },
          }),
        }),
      );
    });

    test('names router and request handler spans after their route', async () => {
      const container = { items: await getSpans('/test/router/user/123') };

      const handlerSpan = findExpressSpan(container, 'request_handler');
      expect(handlerSpan?.name).toBe('/test/router/user/:id');
      // The name has to stay in step with the attribute it comes from.
      expect(handlerSpan?.attributes['http.route']?.value).toBe('/test/router/user/:id');
      expect(handlerSpan?.attributes['sentry.op']?.value).toBe('handler');

      const routerSpan = findExpressSpan(container, 'router');
      expect(routerSpan?.name).toBe('/test/router/user');

      // Spans of other layer types keep their names.
      expect(container.items.find(item => item.name === 'corsMiddleware')?.attributes['express.type']).toEqual({
        type: 'string',
        value: 'middleware',
      });
    });

    test('should set a correct segment name for routes specified in RegEx', async () => {
      const container = { items: await getSpans('/test/regex') };

      expect(findSegmentSpan(container)).toMatchObject({
        name: 'GET /\\/test\\/regex/',
        span_id: expect.stringMatching(/[a-f\d]{16}/),
        trace_id: expect.stringMatching(/[a-f\d]{32}/),
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'http.server' },
          'sentry.segment.name.source': { type: 'string', value: 'route' },
          'url.full': { type: 'string', value: expect.stringMatching(/\/test\/regex$/) },
          'http.response.status_code': { type: 'integer', value: 200 },
        }),
      });
    });

    test('nests a sub-router route handler span under the router span', async () => {
      const container = { items: await getSpans('/test/router/user/42') };

      expect(findSegmentSpan(container)?.name).toBe('GET /test/router/user/:id');

      const routerSpan = findExpressSpan(container, 'router');
      const handlerSpan = findExpressSpan(container, 'request_handler');

      expect(routerSpan).toBeDefined();
      expect(handlerSpan).toBeDefined();

      // The route handler nests under the router span in both instrumentations.
      expect(handlerSpan?.parent_span_id).toBe(routerSpan?.span_id);

      // The handler delays its response by ~100ms (see scenario).
      const routerDurationMs = ((routerSpan?.end_timestamp ?? 0) - (routerSpan?.start_timestamp ?? 0)) * 1000;

      // The router span stays open until the response finishes, so it spans the
      // whole sub-stack it dispatched (~the 100ms handler delay).
      expect(routerDurationMs).toBeGreaterThan(50);
    });

    test('keeps the parameter in a route mounted under a parameterized sub-router path', async () => {
      const container = { items: await getSpans('/test/version/v1/user') };

      const serverSpan = findSegmentSpan(container);
      // The `:version` parameter must be preserved — using the concrete value
      // (`/test/version/v1/user`) would explode route cardinality.
      expect(serverSpan?.name).toBe('GET /test/version/:version/user');
      expect(serverSpan?.attributes['sentry.segment.name.source']).toEqual({ type: 'string', value: 'route' });
    });

    test('handles root page correctly', async () => {
      const container = { items: await getSpans('/') };

      expect(findSegmentSpan(container)).toMatchObject({
        name: 'GET /',
        span_id: expect.stringMatching(/[a-f\d]{16}/),
        trace_id: expect.stringMatching(/[a-f\d]{32}/),
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'http.server' },
          'http.response.status_code': { type: 'integer', value: 200 },
          'http.request.method': { type: 'string', value: 'GET' },
          'url.full': { type: 'string', value: expect.stringMatching(/\/$/) },
          'http.route': { type: 'string', value: '/' },
          'url.path': { type: 'string', value: '/' },
        }),
      });
    });

    // With span streaming, child spans are sent as they end, before the response status code is
    // known, so `ignoreStatusCodes` has no effect and these routes are captured like any other.
    const cases = [
      { status_code: 401, url: '/401', status_message: 'unauthenticated', name: 'GET /401', source: 'route' },
      { status_code: 402, url: '/402', status_message: 'invalid_argument', name: 'GET /402', source: 'route' },
      { status_code: 403, url: '/403', status_message: 'permission_denied', name: 'GET /403', source: 'route' },
      // Without a matching route the name must not carry the URL path.
      { status_code: 404, url: '/does-not-exist', status_message: 'not_found', name: 'GET', source: 'url' },
    ];
    let errorScenario: ReturnType<typeof runScenario> | undefined;
    test.each(cases)('handles $url route correctly', async ({ status_code, url, status_message, name, source }) => {
      errorScenario ??= runScenario(
        cases.map(({ url }) => url),
        true,
      );
      const container = { items: (await errorScenario).get(url)! };
      expect(findSegmentSpan(container), url).toMatchObject({
        name,
        span_id: expect.stringMatching(/[a-f\d]{16}/),
        trace_id: expect.stringMatching(/[a-f\d]{32}/),
        status: 'error',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'http.server' },
          'sentry.segment.name.source': { type: 'string', value: source },
          'sentry.status.message': { type: 'string', value: status_message },
          'http.response.status_code': { type: 'integer', value: status_code },
          'http.request.method': { type: 'string', value: 'GET' },
          'url.full': { type: 'string', value: expect.stringMatching(url) },
          'url.path': { type: 'string', value: url },
        }),
      });
    });

    const segments = ['array1', 'array5'];
    let arrayScenario: ReturnType<typeof runScenario> | undefined;
    test.each(segments)('sets the segment name for route arrays: %s', async segment => {
      arrayScenario ??= runScenario(segments.map(segment => `/test/${segment}`));
      const container = { items: (await arrayScenario).get(`/test/${segment}`)! };
      expect(findSegmentSpan(container), segment).toMatchObject({
        name: 'GET /test/array1,/\\/test\\/array[2-9]/',
        span_id: expect.stringMatching(/[a-f\d]{16}/),
        trace_id: expect.stringMatching(/[a-f\d]{32}/),
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'http.server' },
          'sentry.segment.name.source': { type: 'string', value: 'route' },
          'url.full': { type: 'string', value: expect.stringMatching(`/test/${segment}$`) },
          'http.response.status_code': { type: 'integer', value: 200 },
        }),
      });
    });

    const regexSegments = [
      'arr/545',
      'arr/required',
      'arr/requiredPath',
      'arr/required/lastParam',
      'arr55/required/lastParam',
      'arr/requiredPath/optionalPath/',
      'arr/requiredPath/optionalPath/lastParam',
    ];
    let regexScenario: ReturnType<typeof runScenario> | undefined;
    test.each(regexSegments)('handles complex regexes in route arrays: %s', async segment => {
      regexScenario ??= runScenario(regexSegments.map(segment => `/test/${segment}`));
      const container = { items: (await regexScenario).get(`/test/${segment}`)! };
      expect(findSegmentSpan(container), segment).toMatchObject({
        name: 'GET /test/arr/:id,/\\/test\\/arr\\d*\\/required(path)?(\\/optionalPath)?\\/(lastParam)?/',
        span_id: expect.stringMatching(/[a-f\d]{16}/),
        trace_id: expect.stringMatching(/[a-f\d]{32}/),
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'http.server' },
          'sentry.segment.name.source': { type: 'string', value: 'route' },
          'url.full': { type: 'string', value: expect.stringMatching(`/test/${segment}$`) },
          'http.response.status_code': { type: 'integer', value: 200 },
        }),
      });
    });
  });
});

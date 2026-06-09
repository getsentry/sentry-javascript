/*
 * Tests ported from @opentelemetry/instrumentation-connect@0.61.0
 * Original source: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/instrumentation-connect
 * Licensed under the Apache License, Version 2.0
 */

import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConnectInstrumentation } from '../../../../src/integrations/tracing/connect/vendored/instrumentation';
import type {
  NextHandleFunction,
  PatchedRequest,
} from '../../../../src/integrations/tracing/connect/vendored/internal-types';
import { addNewStackLayer } from '../../../../src/integrations/tracing/connect/vendored/utils';

describe('ConnectInstrumentation', () => {
  const memoryExporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(memoryExporter)] });

  let instrumentation: ConnectInstrumentation;

  beforeEach(() => {
    instrumentation = new ConnectInstrumentation();
    instrumentation.setTracerProvider(provider);
    memoryExporter.reset();
  });

  afterEach(() => {
    instrumentation.disable();
  });

  // Drive `_patchMiddleware` directly with a fake request/response/next (no real `connect` dependency),
  // mirroring how connect invokes a middleware. Calling `next()` ends the span.
  function runMiddleware(routeName: string, middleware: NextHandleFunction): void {
    const patched = instrumentation._patchMiddleware(routeName, middleware) as NextHandleFunction;
    const req = {} as PatchedRequest;
    addNewStackLayer(req);
    const res = new EventEmitter() as unknown as ServerResponse;
    patched(req, res, () => {});
  }

  it('should not generate any spans when disabled', () => {
    instrumentation.disable();

    runMiddleware('', (_req, _res, next) => next());

    expect(memoryExporter.getFinishedSpans()).toHaveLength(0);
  });

  it('should generate span for anonymous middleware', () => {
    runMiddleware('', (_req, _res, next) => next());

    const spans = memoryExporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe('middleware - anonymous');
    expect(spans[0]!.attributes).toEqual({
      'connect.type': 'middleware',
      'connect.name': 'anonymous',
      [ATTR_HTTP_ROUTE]: '/',
    });
  });

  it('should generate span for named middleware', () => {
    runMiddleware('', function middleware1(_req, _res, next) {
      next();
    });

    const spans = memoryExporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe('middleware - middleware1');
    expect(spans[0]!.attributes).toEqual({
      'connect.type': 'middleware',
      'connect.name': 'middleware1',
      [ATTR_HTTP_ROUTE]: '/',
    });
  });

  it('should generate span for route', () => {
    runMiddleware('/foo', (_req, _res, next) => next());

    const spans = memoryExporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe('request handler - /foo');
    expect(spans[0]!.attributes).toEqual({
      'connect.type': 'request_handler',
      'connect.name': '/foo',
      [ATTR_HTTP_ROUTE]: '/foo',
    });
  });
});

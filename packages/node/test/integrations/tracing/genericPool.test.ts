/*
 * Tests ported from @opentelemetry/instrumentation-generic-pool@0.61.0
 * Original source: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/instrumentation-generic-pool
 * Licensed under the Apache License, Version 2.0
 */

import { context, trace } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GenericPoolInstrumentation } from '../../../src/integrations/tracing/genericPool/vendored/instrumentation';
import { cleanupOtel, mockSdkInit } from '../../helpers/mockSdkInit';

// Create a fake `generic-pool` module.
function createPoolModule(): { Pool: new () => { acquire: () => Promise<string> } } {
  class FakePool {
    public acquire(): Promise<string> {
      return Promise.resolve('client');
    }
  }
  return { Pool: FakePool };
}

describe('GenericPoolInstrumentation', () => {
  const memoryExporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(memoryExporter)] });

  let instrumentation: GenericPoolInstrumentation;

  beforeEach(() => {
    mockSdkInit({ tracesSampleRate: 1 });
    instrumentation = new GenericPoolInstrumentation();
    instrumentation.setTracerProvider(provider);
    memoryExporter.reset();
  });

  afterEach(() => {
    instrumentation.disable();
    cleanupOtel();
  });

  it('should attach it to the parent span', async () => {
    const moduleExports = createPoolModule();
    const def = instrumentation.getModuleDefinitions()[0]!;
    def.patch!(moduleExports);

    const parent = provider.getTracer('test').startSpan('parent');
    await context.with(trace.setSpan(context.active(), parent), async () => {
      await new moduleExports.Pool().acquire();
    });
    parent.end();

    const acquireSpan = memoryExporter.getFinishedSpans().find(span => span.name === 'generic-pool.acquire');
    expect(acquireSpan).toBeDefined();
    expect(acquireSpan!.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
  });

  it('should not create anything if disabled', async () => {
    const moduleExports = createPoolModule();
    const def = instrumentation.getModuleDefinitions()[0]!;
    // Patch then unpatch to mimic the instrumentation being disabled.
    def.patch!(moduleExports);
    def.unpatch!(moduleExports);

    await new moduleExports.Pool().acquire();

    expect(memoryExporter.getFinishedSpans()).toHaveLength(0);
  });
});

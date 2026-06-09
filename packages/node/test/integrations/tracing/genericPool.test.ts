import { context, trace } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GenericPoolInstrumentation } from '../../../src/integrations/tracing/genericPool/vendored/instrumentation';
import { cleanupOtel, mockSdkInit } from '../../helpers/mockSdkInit';

// A minimal stand-in for the v3 `generic-pool` module: a `Pool` class with a promise-based `acquire`.
// A fresh class per test keeps each test patching its own prototype (no cross-test contamination).
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
    // `mockSdkInit` gives us a working context manager so `context.with(...)` propagates the active span.
    mockSdkInit({ tracesSampleRate: 1 });
    instrumentation = new GenericPoolInstrumentation();
    instrumentation.setTracerProvider(provider);
    memoryExporter.reset();
  });

  afterEach(() => {
    instrumentation.disable();
    cleanupOtel();
  });

  it('attaches the acquire span to the parent span', async () => {
    const moduleExports = createPoolModule();
    // index 0 is the v3 (`>=3.0.0 <4`) module definition with the promise-based patcher.
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

  it('does not create a span when disabled', async () => {
    const moduleExports = createPoolModule();
    const def = instrumentation.getModuleDefinitions()[0]!;
    // Patch then unpatch to mimic the instrumentation being disabled.
    def.patch!(moduleExports);
    def.unpatch!(moduleExports);

    await new moduleExports.Pool().acquire();

    expect(memoryExporter.getFinishedSpans()).toHaveLength(0);
  });
});

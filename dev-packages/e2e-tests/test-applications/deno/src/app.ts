import { trace } from '@opentelemetry/api';

// Simulate a pre-existing OTel provider (like Supabase Edge Runtime registers
// before user code runs). Without trace.disable() in Sentry's setup, this would
// cause setGlobalTracerProvider to be a no-op, silently dropping all OTel spans.
const fakeProvider = {
  getTracer: () => ({
    startSpan: () => ({ end: () => {}, setAttributes: () => {} }),
    startActiveSpan: (_name: string, fn: Function) => fn({ end: () => {}, setAttributes: () => {} }),
  }),
};
trace.setGlobalTracerProvider(fakeProvider as any);

// Sentry.init() must call trace.disable() to clear the fake provider above
import * as Sentry from '@sentry/deno';
import { generateText } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';
import { z } from 'zod';

Sentry.init({
  environment: 'qa',
  dsn: Deno.env.get('E2E_TEST_DSN'),
  debug: !!Deno.env.get('DEBUG'),
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1,
  sendDefaultPii: true,
  enableLogs: true,
});

const port = 3030;

Deno.serve({ port }, async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === '/test-success') {
    return new Response(JSON.stringify({ version: 'v1' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.pathname === '/test-error') {
    const exceptionId = Sentry.captureException(new Error('This is an error'));
    return new Response(JSON.stringify({ exceptionId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test Sentry.startSpan — uses Sentry's internal pipeline
  if (url.pathname === '/test-sentry-span') {
    Sentry.startSpan({ name: 'test-sentry-span' }, () => {
      // noop
    });
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test OTel tracer.startSpan — goes through the global TracerProvider
  if (url.pathname === '/test-otel-span') {
    const tracer = trace.getTracer('test-tracer');
    const span = tracer.startSpan('test-otel-span');
    span.end();
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test OTel tracer.startActiveSpan — what AI SDK and most instrumentations use
  if (url.pathname === '/test-otel-active-span') {
    const tracer = trace.getTracer('test-tracer');
    tracer.startActiveSpan('test-otel-active-span', span => {
      span.setAttributes({ 'test.active': true });
      span.end();
    });
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test interop: OTel span inside a Sentry span
  if (url.pathname === '/test-interop') {
    Sentry.startSpan({ name: 'sentry-parent' }, () => {
      const tracer = trace.getTracer('test-tracer');
      const span = tracer.startSpan('otel-child');
      span.end();
    });
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test breadcrumbs: add a breadcrumb then capture an error
  if (url.pathname === '/test-breadcrumb') {
    Sentry.addBreadcrumb({
      message: 'test-breadcrumb',
      category: 'custom',
      level: 'info',
    });
    const exceptionId = Sentry.captureException(new Error('breadcrumb-test'));
    return new Response(JSON.stringify({ exceptionId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test context: set user, tag, extra then capture an error
  if (url.pathname === '/test-context') {
    Sentry.setUser({ id: '123', email: 'test@sentry.io' });
    Sentry.setTag('deno-runtime', 'true');
    Sentry.setExtra('detail', { key: 'value' });
    const exceptionId = Sentry.captureException(new Error('context-test'));
    return new Response(JSON.stringify({ exceptionId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test scope isolation: tags inside withScope do not leak
  if (url.pathname === '/test-scope-isolation') {
    let insideId: string | undefined;
    let outsideId: string | undefined;

    Sentry.withScope(scope => {
      scope.setTag('isolated', 'yes');
      insideId = Sentry.captureException(new Error('inside-scope'));
    });

    outsideId = Sentry.captureException(new Error('outside-scope'));

    return new Response(JSON.stringify({ insideId, outsideId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test outbound fetch instrumentation
  if (url.pathname === '/test-outgoing-fetch') {
    const response = await Sentry.startSpan({ name: 'test-outgoing-fetch' }, async () => {
      const res = await fetch('http://localhost:3030/test-success');
      return res.json();
    });
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test AI: Vercel AI SDK generateText with mock model
  if (url.pathname === '/test-ai') {
    const results = await Sentry.startSpan({ op: 'function', name: 'ai-test' }, async () => {
      // First call - telemetry enabled by default
      const result1 = await generateText({
        model: new MockLanguageModelV1({
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: 'First span here!',
          }),
        }),
        prompt: 'Where is the first span?',
      });

      // Second call - explicitly enabled telemetry
      const result2 = await generateText({
        experimental_telemetry: { isEnabled: true },
        model: new MockLanguageModelV1({
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: 'Second span here!',
          }),
        }),
        prompt: 'Where is the second span?',
      });

      // Third call - with tool calls
      const result3 = await generateText({
        model: new MockLanguageModelV1({
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'tool-calls',
            usage: { promptTokens: 15, completionTokens: 25 },
            text: 'Tool call completed!',
            toolCalls: [
              {
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'getWeather',
                args: '{ "location": "San Francisco" }',
              },
            ],
          }),
        }),
        tools: {
          getWeather: {
            parameters: z.object({ location: z.string() }),
            execute: async (args: { location: string }) => {
              return `Weather in ${args.location}: Sunny, 72°F`;
            },
          },
        },
        prompt: 'What is the weather in San Francisco?',
      });

      // Fourth call - explicitly disabled telemetry, should not be captured
      const result4 = await generateText({
        experimental_telemetry: { isEnabled: false },
        model: new MockLanguageModelV1({
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: 'Should not be captured!',
          }),
        }),
        prompt: 'Where is the disabled span?',
      });

      return {
        result1: result1.text,
        result2: result2.text,
        result3: result3.text,
        result4: result4.text,
      };
    });

    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test AI error: tool call that throws
  if (url.pathname === '/test-ai-error') {
    try {
      await Sentry.startSpan({ op: 'function', name: 'ai-error-test' }, async () => {
        await generateText({
          experimental_telemetry: { isEnabled: true },
          model: new MockLanguageModelV1({
            doGenerate: async () => ({
              rawCall: { rawPrompt: null, rawSettings: {} },
              finishReason: 'tool-calls',
              usage: { promptTokens: 15, completionTokens: 25 },
              text: 'Tool call completed!',
              toolCalls: [
                {
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'getWeather',
                  args: '{ "location": "San Francisco" }',
                },
              ],
            }),
          }),
          tools: {
            getWeather: {
              parameters: z.object({ location: z.string() }),
              execute: async (_args: { location: string }) => {
                throw new Error('Tool call failed');
              },
            },
          },
          prompt: 'What is the weather in San Francisco?',
        });
      });
    } catch (e) {
      Sentry.captureException(e);
    }

    return new Response(JSON.stringify({ status: 'error-handled' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test metrics: emit counter, distribution, and gauge
  if (url.pathname === '/test-metrics') {
    Sentry.metrics.count('test.deno.count', 1, {
      attributes: {
        endpoint: '/test-metrics',
        'random.attribute': 'Apples',
      },
    });
    Sentry.metrics.distribution('test.deno.distribution', 100, {
      attributes: {
        endpoint: '/test-metrics',
        'random.attribute': 'Bananas',
      },
    });
    Sentry.metrics.gauge('test.deno.gauge', 200, {
      attributes: {
        endpoint: '/test-metrics',
        'random.attribute': 'Cherries',
      },
    });
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test logs: emit a debug log via Sentry.logger
  if (url.pathname === '/test-log') {
    Sentry.logger.debug('Accessed /test-log route');
    return new Response(JSON.stringify({ message: 'Log sent' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Not found', { status: 404 });
});

console.log(`Deno test app listening on port ${port}`);

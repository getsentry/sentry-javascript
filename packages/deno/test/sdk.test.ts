import { assertNotEquals } from 'https://deno.land/std@0.202.0/assert/assert_not_equals.ts';
import { assertArrayIncludes } from 'https://deno.land/std@0.212.0/assert/assert_array_includes.ts';
import { getDefaultIntegrations, init, spanStreamingIntegration } from '../build/esm/index.js';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';

Deno.test('init() should return client', () => {
  assertNotEquals(init({}), undefined);
});

Deno.test('adds spanStreamingIntegration by default', () => {
  const client = init({});
  const integrations = client.getOptions().integrations;
  assertArrayIncludes(
    integrations.map(i => i.name),
    ['SpanStreaming'],
  );
});

Deno.test('doesn\'t add spanStreamingIntegration when traceLifecycle is "static"', () => {
  const client = init({ traceLifecycle: 'static' });
  const integrations = client.getOptions().integrations;
  assert(!integrations.some(i => i.name === 'SpanStreaming'));
});

Deno.test("doesn't add spanStreamingIntegration if user added it manually", () => {
  const client = init({
    traceLifecycle: 'stream',
    integrations: [spanStreamingIntegration()],
  });
  const integrations = client.getOptions().integrations.filter(i => i.name === 'SpanStreaming');
  assertEquals(integrations.length, 1);
  assert(!integrations[0].isDefaultInstance);
});

Deno.test("doesn't add tracing integrations when tracing is disabled", () => {
  const client = init({});
  const names = client.getOptions().integrations.map(i => i.name);
  assert(!names.includes('Graphql'));
  assert(!names.includes('Postgres'));
  assert(!names.includes('OpenAI'));
});

Deno.test('adds tracing integrations when tracing is enabled', () => {
  const client = init({ tracesSampleRate: 1, traceLifecycle: 'static' });
  const names = client.getOptions().integrations.map(i => i.name);
  assertArrayIncludes(names, ['Graphql', 'Postgres', 'OpenAI']);
});

Deno.test('error integrations stay in place when tracing is disabled', () => {
  const client = init({});
  const names = client.getOptions().integrations.map(i => i.name);
  assertArrayIncludes(names, ['Express', 'Fastify']);
});

// getDefaultIntegrations is public API, so the gate keys off the options the caller
// passes to it, not the ones a client was initialised with.
Deno.test('getDefaultIntegrations gates the tracing set on the options it is given', () => {
  const withTracing = getDefaultIntegrations({ tracesSampleRate: 1 }).map(i => i.name);
  assertArrayIncludes(withTracing, ['Graphql', 'Postgres', 'OpenAI']);
  const withoutTracing = getDefaultIntegrations({}).map(i => i.name);
  assert(!withoutTracing.includes('Graphql'));
});

Deno.test("init doesn't write the computed default integrations back onto the options object", () => {
  const options = { dsn: 'https://username@domain/123' };
  init(options);
  assertEquals('defaultIntegrations' in options, false);
  const second = init({ ...options, tracesSampleRate: 1, traceLifecycle: 'static' });
  const names = second.getOptions().integrations.map(i => i.name);
  assertArrayIncludes(names, ['Graphql']);
});

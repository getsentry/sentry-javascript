import { assertNotEquals } from 'https://deno.land/std@0.202.0/assert/assert_not_equals.ts';
import { assertArrayIncludes } from 'https://deno.land/std@0.212.0/assert/assert_array_includes.ts';
import {
  getCurrentScope,
  getDefaultIntegrations,
  getDefaultIntegrationsWithoutPerformance,
  init as initSdk,
  initWithoutDefaultIntegrations,
  spanStreamingIntegration,
} from '../build/esm/index.js';
import type { DenoOptions } from '../build/esm/index.js';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';

function init(options: DenoOptions) {
  getCurrentScope().setClient(undefined);
  return initSdk(options);
}

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
  assert(!(integrations[0] as { isDefaultInstance?: true }).isDefaultInstance);
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
  const options: DenoOptions = { dsn: 'https://username@domain/123' };
  init(options);
  assertEquals('defaultIntegrations' in options, false);
  options.tracesSampleRate = 1;
  const second = init(options);
  const names = second.getOptions().integrations.map(i => i.name);
  assertArrayIncludes(names, ['Graphql']);
});

Deno.test('initWithoutDefaultIntegrations sets up only the integrations the user passes', () => {
  getCurrentScope().setClient(undefined);
  const client = initWithoutDefaultIntegrations({
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    integrations: [spanStreamingIntegration()],
  });
  const names = client.getOptions().integrations.map(i => i.name);
  assertEquals(names, ['SpanStreaming']);
});

Deno.test('initWithoutDefaultIntegrations keeps defaultIntegrations the user passes', () => {
  getCurrentScope().setClient(undefined);
  const client = initWithoutDefaultIntegrations({
    traceLifecycle: 'static',
    defaultIntegrations: getDefaultIntegrationsWithoutPerformance(),
  });
  const names = client.getOptions().integrations.map(i => i.name);
  assertArrayIncludes(names, ['Breadcrumbs', 'DenoServe', 'Express']);
});

Deno.test('getDefaultIntegrationsWithoutPerformance leaves out the tracing set', () => {
  const names = getDefaultIntegrationsWithoutPerformance().map(i => i.name);
  assertArrayIncludes(names, ['Breadcrumbs', 'DenoServe', 'Express', 'Fastify']);
  assert(!names.includes('Graphql'));
  assert(!names.includes('Postgres'));
  assert(!names.includes('OpenAI'));
});

Deno.test('getDefaultIntegrations is getDefaultIntegrationsWithoutPerformance plus the tracing set', () => {
  const base = getDefaultIntegrationsWithoutPerformance().map(i => i.name);
  const full = getDefaultIntegrations({ tracesSampleRate: 1 }).map(i => i.name);
  assertEquals(full.slice(0, base.length), base);
  assertArrayIncludes(full.slice(base.length), ['Graphql', 'Postgres', 'OpenAI']);
});

import { assertNotEquals } from 'https://deno.land/std@0.202.0/assert/assert_not_equals.ts';
import { assertArrayIncludes } from 'https://deno.land/std@0.212.0/assert/assert_array_includes.ts';
import { init, spanStreamingIntegration } from '../build/esm/index.js';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';

Deno.test('init() should return client', () => {
  assertNotEquals(init({}), undefined);
});

Deno.test('adds spanStreamingIntegration when traceLifecycle is "stream"', () => {
  const client = init({ traceLifecycle: 'stream' });
  const integrations = client.getOptions().integrations;
  assertArrayIncludes(
    integrations.map(i => i.name),
    ['SpanStreaming'],
  );
});

Deno.test('doesn\'t add spanStreamingIntegration when traceLifecycle is not "stream"', () => {
  const client = init({});
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

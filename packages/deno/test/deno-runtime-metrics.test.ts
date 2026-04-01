// <reference lib="deno.ns" />

import type { Envelope } from '@sentry/core';
import { createStackParser, forEachEnvelopeItem, nodeStackLineParser } from '@sentry/core';
import { assertEquals, assertNotEquals, assertStringIncludes } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import {
  DenoClient,
  denoRuntimeMetricsIntegration,
  getCurrentScope,
  getDefaultIntegrations,
} from '../build/esm/index.js';
import { makeTestTransport } from './transport.ts';

const DSN = 'https://233a45e5efe34c47a3536797ce15dafa@nothing.here/5650507';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// deno-lint-ignore no-explicit-any
type MetricItem = { name: string; type: string; value: number; unit?: string; attributes?: Record<string, any> };

async function collectMetrics(
  integrationOptions: Parameters<typeof denoRuntimeMetricsIntegration>[0] = {},
): Promise<MetricItem[]> {
  const envelopes: Envelope[] = [];

  // Hold a reference so we can call teardown() to stop the interval before the test ends.
  const metricsIntegration = denoRuntimeMetricsIntegration({ collectionIntervalMs: 1000, ...integrationOptions });

  const client = new DenoClient({
    dsn: DSN,
    integrations: [...getDefaultIntegrations({}), metricsIntegration],
    stackParser: createStackParser(nodeStackLineParser()),
    transport: makeTestTransport(envelope => {
      envelopes.push(envelope);
    }),
  });

  client.init();
  getCurrentScope().setClient(client);

  await delay(2500);
  await client.flush(2000);

  // Stop the collection interval so Deno's leak detector doesn't flag it.
  metricsIntegration.teardown?.();

  const items: MetricItem[] = [];
  for (const envelope of envelopes) {
    forEachEnvelopeItem(envelope, item => {
      const [headers, body] = item;
      if (headers.type === 'trace_metric') {
        // deno-lint-ignore no-explicit-any
        items.push(...(body as any).items);
      }
    });
  }

  return items;
}

Deno.test('denoRuntimeMetricsIntegration has the correct name', () => {
  const integration = denoRuntimeMetricsIntegration();
  assertEquals(integration.name, 'DenoRuntimeMetrics');
});

Deno.test('emits default memory metrics with correct shape', async () => {
  const items = await collectMetrics();
  const names = items.map(i => i.name);

  assertEquals(names.includes('deno.runtime.mem.rss'), true);
  assertEquals(names.includes('deno.runtime.mem.heap_used'), true);
  assertEquals(names.includes('deno.runtime.mem.heap_total'), true);

  const rss = items.find(i => i.name === 'deno.runtime.mem.rss');
  assertEquals(rss?.type, 'gauge');
  assertEquals(rss?.unit, 'byte');
  assertEquals(typeof rss?.value, 'number');
});

Deno.test('emits uptime counter', async () => {
  const items = await collectMetrics();
  const uptime = items.find(i => i.name === 'deno.runtime.process.uptime');

  assertNotEquals(uptime, undefined);
  assertEquals(uptime?.type, 'counter');
  assertEquals(uptime?.unit, 'second');
});

Deno.test('does not emit mem.external by default', async () => {
  const items = await collectMetrics();
  const names = items.map(i => i.name);
  assertEquals(names.includes('deno.runtime.mem.external'), false);
});

Deno.test('emits mem.external when opted in', async () => {
  const items = await collectMetrics({ collect: { memExternal: true } });
  const external = items.find(i => i.name === 'deno.runtime.mem.external');

  assertNotEquals(external, undefined);
  assertEquals(external?.type, 'gauge');
  assertEquals(external?.unit, 'byte');
});

Deno.test('respects opt-out: skips uptime when disabled', async () => {
  const items = await collectMetrics({ collect: { uptime: false } });
  const names = items.map(i => i.name);

  assertEquals(names.includes('deno.runtime.mem.rss'), true);
  assertEquals(names.includes('deno.runtime.process.uptime'), false);
});

Deno.test('attaches correct sentry.origin attribute', async () => {
  const items = await collectMetrics();
  const rss = items.find(i => i.name === 'deno.runtime.mem.rss');

  // Attributes in the serialized envelope are { type, value } objects.
  assertEquals(rss?.attributes?.['sentry.origin']?.value, 'auto.deno.runtime_metrics');
});

Deno.test('warns and enforces minimum collectionIntervalMs', () => {
  const warnings: string[] = [];
  const originalWarn = globalThis.console.warn;
  globalThis.console.warn = (msg: string) => warnings.push(msg);

  try {
    denoRuntimeMetricsIntegration({ collectionIntervalMs: 100 });
  } finally {
    globalThis.console.warn = originalWarn;
  }

  assertEquals(warnings.length, 1);
  assertStringIncludes(warnings[0]!, 'collectionIntervalMs');
  assertStringIncludes(warnings[0]!, '1000');
});

Deno.test('warns and falls back to minimum when collectionIntervalMs is NaN', () => {
  const warnings: string[] = [];
  const originalWarn = globalThis.console.warn;
  globalThis.console.warn = (msg: string) => warnings.push(msg);

  try {
    denoRuntimeMetricsIntegration({ collectionIntervalMs: NaN });
  } finally {
    globalThis.console.warn = originalWarn;
  }

  assertEquals(warnings.length, 1);
  assertStringIncludes(warnings[0]!, 'collectionIntervalMs');
});

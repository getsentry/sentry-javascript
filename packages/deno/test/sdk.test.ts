import { assertEquals } from 'https://deno.land/std@0.202.0/assert/assert_equals.ts';
import { assertNotEquals } from 'https://deno.land/std@0.202.0/assert/assert_not_equals.ts';
import { getDefaultIntegrations, init } from '../build/esm/index.js';

Deno.test('init() should return client', () => {
  assertNotEquals(init({}), undefined);
});

Deno.test('getDefaultIntegrations returns list of integrations with default options', () => {
  const integrations = getDefaultIntegrations({}).map(integration => integration.name);
  assertEquals(integrations, [
    'InboundFilters',
    'FunctionToString',
    'LinkedErrors',
    'Dedupe',
    'Breadcrumbs',
    'DenoContext',
    'ContextLines',
    'NormalizePaths',
    'GlobalHandlers',
  ]);
});

Deno.test('getDefaultIntegrations returns spanStreamingIntegration if traceLifecycle is stream', () => {
  const integrations = getDefaultIntegrations({ traceLifecycle: 'stream' }).map(integration => integration.name);
  assertEquals(integrations, [
    'InboundFilters',
    'FunctionToString',
    'LinkedErrors',
    'Dedupe',
    'Breadcrumbs',
    'DenoContext',
    'ContextLines',
    'NormalizePaths',
    'GlobalHandlers',
    'SpanStreaming',
  ]);
});

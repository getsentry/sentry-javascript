import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import * as Sentry from '../build/esm/index.js';
import type { FlueOptions } from '../build/esm/index.js';

// Exports that Cloudflare ships and that need no Node APIs.
const EXPECTED_FUNCTION_EXPORTS = [
  // @sentry/core
  'addIntegration',
  'withActiveSpan',
  'getSpanDescendants',
  'setConversationId',
  'createConsolaReporter',
  'growthbookIntegration',
  'moduleMetadataIntegration',
  'parameterize',
  'getTunnelPath',
  'handleTunnelRequest',
  // @sentry/core/server
  'trpcMiddleware',
  'serveTunnelIntegration',
  'handleTunnelRequestIfMatched',
  'isTunnelRequest',
  // @sentry/server-utils
  'prismaIntegration',
  'instrumentOpenAiClient',
  'instrumentAnthropicAiClient',
  'instrumentGoogleGenAIClient',
  'instrumentMistralAiClient',
  'instrumentTypeSafeClient',
  'createLangChainCallbackHandler',
  'instrumentLangChainEmbeddings',
  'instrumentStateGraph',
  'instrumentStateGraphCompile',
  'instrumentCreateReactAgent',
  // In the default integrations, so users who set `defaultIntegrations` can add it back
  'fastifyIntegration',
  // ./sdk
  'initWithoutDefaultIntegrations',
  'getDefaultIntegrationsWithoutPerformance',
];

for (const name of EXPECTED_FUNCTION_EXPORTS) {
  Deno.test(`exports ${name}`, () => {
    assertEquals(typeof (Sentry as Record<string, unknown>)[name], 'function');
  });
}

// Shared with `@sentry/node`, for libraries that run on Deno through npm.
for (const name of ['pinoIntegration', 'createSentryWinstonTransport', 'BullMQTelemetry']) {
  Deno.test(`exports ${name}`, () => {
    assertEquals(typeof (Sentry as Record<string, unknown>)[name], 'function');
  });
}

Deno.test('exports the cron instrumentation', () => {
  assertEquals(typeof Sentry.cron.instrumentCron, 'function');
  assertEquals(typeof Sentry.cron.instrumentNodeCron, 'function');
  assertEquals(typeof Sentry.cron.instrumentNodeSchedule, 'function');
});

Deno.test('exports the FlueOptions type', () => {
  const options: FlueOptions = {};
  assertEquals(typeof options, 'object');
});

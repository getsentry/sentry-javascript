import { tracingChannel } from 'node:diagnostics_channel';
import type { Client } from '@sentry/core';
import { _INTERNAL_clearAiProviderSkips, _INTERNAL_shouldSkipAiProviderWrapping, GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ANTHROPIC_AI_INTEGRATION_NAME } from '../../../src/ai/anthropic-ai/constants';
import { GOOGLE_GENAI_INTEGRATION_NAME } from '../../../src/ai/google-genai/constants';
import { OPENAI_INTEGRATION_NAME } from '../../../src/ai/openai/constants';
import { mastraIntegration } from '../../../src/integrations/mastra';
import { CHANNELS } from '../../../src/orchestrion/channels';

function fakeMastra(): {
  registerExporter: (exporter: unknown, instance: unknown, entrypoint: unknown) => void;
  observability: { getDefaultInstance: () => { getExporters: () => unknown[] } };
} {
  const exporters: unknown[] = [];
  return {
    registerExporter: exporter => {
      exporters.push(exporter);
    },
    observability: {
      getDefaultInstance: () => ({
        getExporters: () => exporters,
      }),
    },
  };
}

describe('mastraIntegration provider skip', () => {
  beforeEach(() => {
    _INTERNAL_clearAiProviderSkips();
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@mastra/core'] };
    mastraIntegration().setup?.({
      on: () => () => undefined,
    } as unknown as Client);
  });

  afterEach(() => {
    _INTERNAL_clearAiProviderSkips();
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  it('does not skip raw providers at setup, before any Mastra instance is constructed', () => {
    expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);
    expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(false);
    expect(_INTERNAL_shouldSkipAiProviderWrapping(GOOGLE_GENAI_INTEGRATION_NAME)).toBe(false);
  });

  it('does not skip raw providers when a Mastra instance is constructed', () => {
    tracingChannel(CHANNELS.MASTRA_CONSTRUCTOR).end.publish({ self: fakeMastra(), arguments: [] });

    expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);
    expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(false);
    expect(_INTERNAL_shouldSkipAiProviderWrapping(GOOGLE_GENAI_INTEGRATION_NAME)).toBe(false);
  });

  it('does not skip providers when the instance has no registerExporter', () => {
    tracingChannel(CHANNELS.MASTRA_CONSTRUCTOR).end.publish({ self: {}, arguments: [] });

    expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);
  });
});

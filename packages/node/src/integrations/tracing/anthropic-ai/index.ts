import type { AnthropicAiOptions } from '@sentry/core';
import { ANTHROPIC_AI_INTEGRATION_NAME } from '@sentry/core';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { SentryAnthropicAiInstrumentation } from './instrumentation';

export const instrumentAnthropicAi = generateInstrumentOnce<AnthropicAiOptions>(
  ANTHROPIC_AI_INTEGRATION_NAME,
  options => new SentryAnthropicAiInstrumentation(options),
);

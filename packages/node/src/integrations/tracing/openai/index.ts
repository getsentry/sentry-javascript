import type { OpenAiOptions } from '@sentry/core';
import { OPENAI_INTEGRATION_NAME } from '@sentry/core';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { SentryOpenAiInstrumentation } from './instrumentation';

export const instrumentOpenAi = generateInstrumentOnce<OpenAiOptions>(
  OPENAI_INTEGRATION_NAME,
  options => new SentryOpenAiInstrumentation(options),
);

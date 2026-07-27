import type { GoogleGenAIOptions } from '@sentry/core';
import { GOOGLE_GENAI_INTEGRATION_NAME } from '@sentry/core';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { SentryGoogleGenAiInstrumentation } from './instrumentation';

export const instrumentGoogleGenAI = generateInstrumentOnce<GoogleGenAIOptions>(
  GOOGLE_GENAI_INTEGRATION_NAME,
  options => new SentryGoogleGenAiInstrumentation(options),
);

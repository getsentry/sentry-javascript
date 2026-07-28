import type { LangChainOptions } from '@sentry/core';
import { LANGCHAIN_INTEGRATION_NAME } from '@sentry/core';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { SentryLangChainInstrumentation } from './instrumentation';

export const instrumentLangChain = generateInstrumentOnce<LangChainOptions>(
  LANGCHAIN_INTEGRATION_NAME,
  options => new SentryLangChainInstrumentation(options),
);

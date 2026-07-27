import type { LangGraphOptions } from '@sentry/core';
import { LANGGRAPH_INTEGRATION_NAME } from '@sentry/core';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { SentryLangGraphInstrumentation } from './instrumentation';

export const instrumentLangGraph = generateInstrumentOnce<LangGraphOptions>(
  LANGGRAPH_INTEGRATION_NAME,
  options => new SentryLangGraphInstrumentation(options),
);

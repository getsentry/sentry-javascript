import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node';
import { NestInstrumentation } from './sentry-nest-core-instrumentation';
import { SentryNestEventInstrumentation } from './sentry-nest-event-instrumentation';
import { SentryNestInstrumentation } from './sentry-nest-instrumentation';

const INTEGRATION_NAME = 'Nest';

const instrumentNestCore = generateInstrumentOnce('Nest-Core', () => {
  return new NestInstrumentation();
});

const instrumentNestCommon = generateInstrumentOnce('Nest-Common', () => {
  return new SentryNestInstrumentation();
});

const instrumentNestEvent = generateInstrumentOnce('Nest-Event', () => {
  return new SentryNestEventInstrumentation();
});

export const instrumentNest = Object.assign(
  (): void => {
    instrumentNestCore();
    instrumentNestCommon();
    instrumentNestEvent();
  },
  { id: INTEGRATION_NAME },
);

/**
 * Integration capturing tracing data for NestJS.
 */
export const nestIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentNest();
    },
  };
});

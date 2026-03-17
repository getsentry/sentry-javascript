import { NestInstrumentation as NestInstrumentationCore } from '@opentelemetry/instrumentation-nestjs-core';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node';
import { SentryNestBullMQInstrumentation } from './sentry-nest-bullmq-instrumentation';
import { SentryNestEventInstrumentation } from './sentry-nest-event-instrumentation';
import { SentryNestInstrumentation } from './sentry-nest-instrumentation';
import { SentryNestScheduleInstrumentation } from './sentry-nest-schedule-instrumentation';

const INTEGRATION_NAME = 'Nest';

const instrumentNestCore = generateInstrumentOnce(`${INTEGRATION_NAME}.Core`, () => {
  return new NestInstrumentationCore();
});

const instrumentNestCommon = generateInstrumentOnce(`${INTEGRATION_NAME}.Common`, () => {
  return new SentryNestInstrumentation();
});

const instrumentNestEvent = generateInstrumentOnce(`${INTEGRATION_NAME}.Event`, () => {
  return new SentryNestEventInstrumentation();
});

const instrumentNestSchedule = generateInstrumentOnce(`${INTEGRATION_NAME}.Schedule`, () => {
  return new SentryNestScheduleInstrumentation();
});

const instrumentNestBullMQ = generateInstrumentOnce(`${INTEGRATION_NAME}.BullMQ`, () => {
  return new SentryNestBullMQInstrumentation();
});

export const instrumentNest = Object.assign(
  (): void => {
    instrumentNestCore();
    instrumentNestCommon();
    instrumentNestEvent();
    instrumentNestSchedule();
    instrumentNestBullMQ();
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

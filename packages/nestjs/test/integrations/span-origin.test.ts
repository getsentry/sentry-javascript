import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import {
  getBullMQProcessSpanOptions,
  getEventSpanOptions,
  getMiddlewareSpanOptions,
  httpOrigin,
} from '../../src/integrations/helpers';

function middlewareOrigin(componentType?: string): unknown {
  return getMiddlewareSpanOptions({ name: 'X' }, undefined, componentType).attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN];
}

function eventOrigin(): unknown {
  return getEventSpanOptions('x').attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN];
}

function bullmqOrigin(): unknown {
  return getBullMQProcessSpanOptions('q').attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN];
}

// NestJS instrumentation is channel-based, so spans always use the orchestrion
// origins.
describe('NestJS span origin selection', () => {
  it('emits orchestrion origins', () => {
    expect(httpOrigin()).toBe('auto.http.orchestrion.nestjs');
    expect(middlewareOrigin()).toBe('auto.middleware.orchestrion.nestjs');
    expect(middlewareOrigin('guard')).toBe('auto.middleware.orchestrion.nestjs.guard');
    expect(middlewareOrigin('interceptor')).toBe('auto.middleware.orchestrion.nestjs.interceptor');
    expect(middlewareOrigin('pipe')).toBe('auto.middleware.orchestrion.nestjs.pipe');
    expect(eventOrigin()).toBe('auto.event.orchestrion.nestjs');
    expect(bullmqOrigin()).toBe('auto.queue.orchestrion.nestjs.bullmq');
  });
});

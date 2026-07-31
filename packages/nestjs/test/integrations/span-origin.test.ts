import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import {
  getBullMQProcessSpanOptions,
  getEventSpanOptions,
  getMiddlewareSpanOptions,
  HTTP_ORIGIN,
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

describe('NestJS span origin', () => {
  it('emits the nestjs origins', () => {
    expect(HTTP_ORIGIN).toBe('auto.http.nestjs');
    expect(middlewareOrigin()).toBe('auto.middleware.nestjs');
    expect(middlewareOrigin('guard')).toBe('auto.middleware.nestjs.guard');
    expect(middlewareOrigin('interceptor')).toBe('auto.middleware.nestjs.interceptor');
    expect(middlewareOrigin('pipe')).toBe('auto.middleware.nestjs.pipe');
    expect(eventOrigin()).toBe('auto.event.nestjs');
    expect(bullmqOrigin()).toBe('auto.queue.nestjs.bullmq');
  });
});

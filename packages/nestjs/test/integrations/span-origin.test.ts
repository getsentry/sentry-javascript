import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getBullMQProcessSpanOptions,
  getEventSpanOptions,
  getMiddlewareSpanOptions,
  httpOrigin,
} from '../../src/integrations/helpers';

type Marker = { runtime?: boolean; bundler?: boolean } | undefined;

function setMarker(marker: Marker): void {
  (globalThis as { __SENTRY_ORCHESTRION__?: Marker }).__SENTRY_ORCHESTRION__ = marker;
}

function middlewareOrigin(componentType?: string): unknown {
  return getMiddlewareSpanOptions({ name: 'X' }, undefined, componentType).attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN];
}

function eventOrigin(): unknown {
  return getEventSpanOptions('x').attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN];
}

function bullmqOrigin(): unknown {
  return getBullMQProcessSpanOptions('q').attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN];
}

// `nestIntegration` takes the channel path exactly when `isOrchestrionInjected()`
// is true (the `@nestjs/*` transform is always in the static config, so the
// global flag is sufficient), and the OTel path otherwise. The span origin
// follows the same flag.
describe('NestJS span origin selection', () => {
  afterEach(() => {
    delete (globalThis as { __SENTRY_ORCHESTRION__?: Marker }).__SENTRY_ORCHESTRION__;
  });

  it('emits orchestrion origins when injected via the runtime hook', () => {
    setMarker({ runtime: true });

    expect(httpOrigin()).toBe('auto.http.orchestrion.nestjs');
    expect(middlewareOrigin()).toBe('auto.middleware.orchestrion.nestjs');
    expect(middlewareOrigin('guard')).toBe('auto.middleware.orchestrion.nestjs.guard');
    expect(eventOrigin()).toBe('auto.event.orchestrion.nestjs');
    expect(bullmqOrigin()).toBe('auto.queue.orchestrion.nestjs.bullmq');
  });

  it('emits orchestrion origins when injected via a bundler plugin', () => {
    setMarker({ bundler: true });

    expect(httpOrigin()).toBe('auto.http.orchestrion.nestjs');
    expect(middlewareOrigin('interceptor')).toBe('auto.middleware.orchestrion.nestjs.interceptor');
  });

  it('emits OTel origins when orchestrion is not injected', () => {
    setMarker(undefined);

    expect(httpOrigin()).toBe('auto.http.otel.nestjs');
    expect(middlewareOrigin()).toBe('auto.middleware.nestjs');
    expect(middlewareOrigin('pipe')).toBe('auto.middleware.nestjs.pipe');
    expect(eventOrigin()).toBe('auto.event.nestjs');
    expect(bullmqOrigin()).toBe('auto.queue.nestjs.bullmq');
  });
});

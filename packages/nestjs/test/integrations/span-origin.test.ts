import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getBullMQProcessSpanOptions,
  getEventSpanOptions,
  getMiddlewareSpanOptions,
  httpOrigin,
} from '../../src/integrations/helpers';

type Marker = { runtime?: boolean; bundler?: boolean; installed?: string[] } | undefined;

function setMarker(marker: Marker): void {
  (globalThis as { __SENTRY_ORCHESTRION__?: Marker }).__SENTRY_ORCHESTRION__ = marker;
}

function middlewareOrigin(componentType?: string): unknown {
  return getMiddlewareSpanOptions({ name: 'X' }, undefined, componentType).attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN];
}

// The span origin is selected per-instrumentation via `isOrchestrionInjected('nestjs')`,
// NOT the global injection flag: a NestJS app might have another library
// orchestrion-injected while Nest itself still runs through OTel (e.g. a bare
// `@sentry/node/import` hook installed before `@sentry/nestjs` registered), or
// vice versa. The origin must follow the path Nest actually took.
describe('NestJS span origin selection', () => {
  afterEach(() => {
    delete (globalThis as { __SENTRY_ORCHESTRION__?: Marker }).__SENTRY_ORCHESTRION__;
  });

  describe('when nestjs is orchestrion-instrumented', () => {
    it('emits orchestrion origins', () => {
      setMarker({ runtime: true, installed: ['nestjs'] });

      expect(httpOrigin()).toBe('auto.http.orchestrion.nestjs');
      expect(middlewareOrigin()).toBe('auto.middleware.orchestrion.nestjs');
      expect(middlewareOrigin('guard')).toBe('auto.middleware.orchestrion.nestjs.guard');
      expect(getEventSpanOptions('x').attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe(
        'auto.event.orchestrion.nestjs',
      );
      expect(getBullMQProcessSpanOptions('q').attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe(
        'auto.queue.orchestrion.nestjs.bullmq',
      );
    });
  });

  describe('when a DIFFERENT library is orchestrion-injected but nestjs is not', () => {
    it('emits OTel origins (Nest ran via the OTel path)', () => {
      // Simulates the bug scenario: `runtime` is set (something was injected),
      // but `nestjs` is not in the installed set, so Nest still uses OTel.
      setMarker({ runtime: true, installed: ['mysql'] });

      expect(httpOrigin()).toBe('auto.http.otel.nestjs');
      expect(middlewareOrigin()).toBe('auto.middleware.nestjs');
      expect(middlewareOrigin('interceptor')).toBe('auto.middleware.nestjs.interceptor');
      expect(getEventSpanOptions('x').attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe('auto.event.nestjs');
      expect(getBullMQProcessSpanOptions('q').attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe(
        'auto.queue.nestjs.bullmq',
      );
    });
  });

  describe('when orchestrion is not injected at all', () => {
    it('emits OTel origins', () => {
      setMarker(undefined);

      expect(httpOrigin()).toBe('auto.http.otel.nestjs');
      expect(middlewareOrigin('pipe')).toBe('auto.middleware.nestjs.pipe');
    });
  });
});

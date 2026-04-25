/*
 * Tests ported from @opentelemetry/instrumentation-redis@0.62.0
 * Original source: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/instrumentation-redis
 * Licensed under the Apache License, Version 2.0
 */

import { SpanStatusCode } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RedisInstrumentation } from '../../../../src/integrations/tracing/redis/vendored/redis-instrumentation';

const memoryExporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(memoryExporter)] });

describe('RedisInstrumentation', () => {
  let instrumentation: RedisInstrumentation;

  beforeEach(() => {
    instrumentation = new RedisInstrumentation();
    instrumentation.setTracerProvider(provider);
    memoryExporter.reset();
  });

  afterEach(() => {
    instrumentation.disable();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance with default config', () => {
      const inst = new RedisInstrumentation();
      expect(inst).toBeInstanceOf(RedisInstrumentation);
      expect(inst.getConfig().requireParentSpan).toBe(false);
    });

    it('should create an instance with custom config', () => {
      const inst = new RedisInstrumentation({ requireParentSpan: true });
      expect(inst.getConfig().requireParentSpan).toBe(true);
    });

    it('should enable and disable without throwing', () => {
      const inst = new RedisInstrumentation();
      expect(() => inst.enable()).not.toThrow();
      expect(() => inst.disable()).not.toThrow();
    });
  });

  describe('setConfig', () => {
    it('should keep requireParentSpan default as false when config is empty', () => {
      instrumentation.setConfig({});
      expect(instrumentation.getConfig().requireParentSpan).toBe(false);
    });

    it('should propagate config updates', () => {
      const responseHook = vi.fn();
      instrumentation.setConfig({ responseHook });
      expect(instrumentation.getConfig().responseHook).toBe(responseHook);
    });
  });

  describe('getModuleDefinitions', () => {
    it('should return module definitions from both v2-v3 and v4-v5 instrumentations', () => {
      const defs = instrumentation.getModuleDefinitions();
      // v2-v3 instruments 'redis', v4-v5 instruments '@redis/client' and '@node-redis/client'
      expect(defs.length).toBeGreaterThanOrEqual(3);
      const moduleNames = defs.map((d: any) => d.name);
      expect(moduleNames).toContain('redis');
      expect(moduleNames).toContain('@redis/client');
      expect(moduleNames).toContain('@node-redis/client');
    });
  });

  describe('setTracerProvider', () => {
    it('should accept a tracer provider', () => {
      expect(() => instrumentation.setTracerProvider(provider)).not.toThrow();
    });
  });

  describe('_endSpanWithResponse (v4-v5)', () => {
    it('should call responseHook when no error occurs', () => {
      const responseHook = vi.fn();
      const inst = new RedisInstrumentation({ responseHook });
      inst.setTracerProvider(provider);

      const span = provider.getTracer('test').startSpan('test-span');
      const v4v5 = (inst as any).instrumentationV4_V5;
      v4v5._endSpanWithResponse(span, 'GET', ['mykey'], 'myvalue', undefined);

      expect(responseHook).toHaveBeenCalledWith(span, 'GET', ['mykey'], 'myvalue');
    });

    it('should not call responseHook when error occurs', () => {
      const responseHook = vi.fn();
      const inst = new RedisInstrumentation({ responseHook });
      inst.setTracerProvider(provider);

      const span = provider.getTracer('test').startSpan('test-span');
      const v4v5 = (inst as any).instrumentationV4_V5;
      const error = new Error('connection failed');
      v4v5._endSpanWithResponse(span, 'GET', ['mykey'], null, error);

      expect(responseHook).not.toHaveBeenCalled();
    });

    it('should set error status on span when error occurs', () => {
      const inst = new RedisInstrumentation();
      inst.setTracerProvider(provider);

      const span = provider.getTracer('test').startSpan('test-span');
      const v4v5 = (inst as any).instrumentationV4_V5;
      const error = new Error('connection failed');
      v4v5._endSpanWithResponse(span, 'GET', ['mykey'], null, error);

      const exportedSpans = memoryExporter.getFinishedSpans();
      expect(exportedSpans).toHaveLength(1);
      expect(exportedSpans[0]!.status.code).toBe(SpanStatusCode.ERROR);
      expect(exportedSpans[0]!.status.message).toBe('connection failed');
    });
  });

  describe('_endSpansWithRedisReplies (v4-v5 multi/pipeline)', () => {
    it('should end all spans with their corresponding replies', () => {
      const inst = new RedisInstrumentation();
      inst.setTracerProvider(provider);
      const v4v5 = (inst as any).instrumentationV4_V5;

      const tracer = provider.getTracer('test');
      const span1 = tracer.startSpan('redis-SET');
      const span2 = tracer.startSpan('redis-GET');

      const openSpans = [
        { span: span1, commandName: 'SET', commandArgs: ['key1', 'value1'] },
        { span: span2, commandName: 'GET', commandArgs: ['key1'] },
      ];

      v4v5._endSpansWithRedisReplies(openSpans, ['OK', 'value1'], false);

      const exportedSpans = memoryExporter.getFinishedSpans();
      expect(exportedSpans).toHaveLength(2);
      exportedSpans.forEach(s => {
        expect(s.status.code).not.toBe(SpanStatusCode.ERROR);
      });
    });

    it('should handle error replies in multi commands', () => {
      const inst = new RedisInstrumentation();
      inst.setTracerProvider(provider);
      const v4v5 = (inst as any).instrumentationV4_V5;

      const tracer = provider.getTracer('test');
      const span1 = tracer.startSpan('redis-SET');

      const openSpans = [{ span: span1, commandName: 'SET', commandArgs: ['key1', 'value1'] }];
      const error = new Error('command error');

      v4v5._endSpansWithRedisReplies(openSpans, [error], false);

      const exportedSpans = memoryExporter.getFinishedSpans();
      expect(exportedSpans).toHaveLength(1);
      expect(exportedSpans[0]!.status.code).toBe(SpanStatusCode.ERROR);
    });

    it('should log error when openSpans is undefined', () => {
      const inst = new RedisInstrumentation();
      inst.setTracerProvider(provider);
      const v4v5 = (inst as any).instrumentationV4_V5;
      const diagSpy = vi.spyOn(v4v5._diag, 'error');

      v4v5._endSpansWithRedisReplies(undefined, [], false);

      expect(diagSpy).toHaveBeenCalled();
    });

    it('should log error when replies length does not match open spans', () => {
      const inst = new RedisInstrumentation();
      inst.setTracerProvider(provider);
      const v4v5 = (inst as any).instrumentationV4_V5;
      const diagSpy = vi.spyOn(v4v5._diag, 'error');

      const tracer = provider.getTracer('test');
      const span1 = tracer.startSpan('redis-GET');

      v4v5._endSpansWithRedisReplies(
        [{ span: span1, commandName: 'GET', commandArgs: ['key'] }],
        [], // wrong number of replies
        false,
      );

      expect(diagSpy).toHaveBeenCalled();
    });
  });
});

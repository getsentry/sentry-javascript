/*
 * Tests ported from @opentelemetry/instrumentation-ioredis@0.62.0
 * Original source: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/instrumentation-ioredis
 * Licensed under the Apache License, Version 2.0
 */

import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IORedisInstrumentation } from '../../../../src/integrations/tracing/redis/vendored/ioredis-instrumentation';

const memoryExporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(memoryExporter)] });

describe('IORedisInstrumentation', () => {
  let instrumentation: IORedisInstrumentation;

  beforeEach(() => {
    instrumentation = new IORedisInstrumentation();
    instrumentation.setTracerProvider(provider);
    memoryExporter.reset();
  });

  afterEach(() => {
    instrumentation.disable();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance with default config (requireParentSpan = true)', () => {
      const inst = new IORedisInstrumentation();
      expect(inst).toBeInstanceOf(IORedisInstrumentation);
      expect(inst.getConfig().requireParentSpan).toBe(true);
    });

    it('should create an instance with custom config', () => {
      const inst = new IORedisInstrumentation({ requireParentSpan: false });
      expect(inst.getConfig().requireParentSpan).toBe(false);
    });
  });

  describe('setConfig', () => {
    it('should preserve default requireParentSpan = true when config is empty', () => {
      instrumentation.setConfig({});
      expect(instrumentation.getConfig().requireParentSpan).toBe(true);
    });

    it('should allow overriding requireParentSpan', () => {
      instrumentation.setConfig({ requireParentSpan: false });
      expect(instrumentation.getConfig().requireParentSpan).toBe(false);
    });
  });

  describe('init', () => {
    it('should return module definitions for ioredis', () => {
      const defs = instrumentation.init();
      expect(Array.isArray(defs)).toBe(true);
      expect(defs).toHaveLength(1);
      expect(defs[0]!.name).toBe('ioredis');
    });

    it('should support ioredis versions >=2.0.0 <6', () => {
      const defs = instrumentation.init();
      const supportedVersions = defs[0]!.supportedVersions;
      expect(supportedVersions).toContain('>=2.0.0 <6');
    });
  });

  describe('_patchSendCommand', () => {
    it('should skip tracing when no parent span and requireParentSpan is true', () => {
      instrumentation.setConfig({ requireParentSpan: true });
      const original = vi.fn().mockReturnValue(Promise.resolve('OK'));

      const patchFn = (instrumentation as any)._patchSendCommand();
      const patched = patchFn(original);

      const fakeThis = {
        options: { host: 'localhost', port: 6379 },
      };
      const fakeCmd = {
        name: 'get',
        args: ['mykey'],
        resolve: vi.fn(),
        reject: vi.fn(),
      };

      patched.call(fakeThis, fakeCmd);

      expect(original).toHaveBeenCalled();
      expect(memoryExporter.getFinishedSpans()).toHaveLength(0);
    });

    it('should not trace when called with less than 1 argument', () => {
      const original = vi.fn().mockReturnValue(undefined);
      const patchFn = (instrumentation as any)._patchSendCommand();
      const patched = patchFn(original);

      const fakeThis = { options: { host: 'localhost', port: 6379 } };

      patched.call(fakeThis);

      expect(original).toHaveBeenCalled();
      expect(memoryExporter.getFinishedSpans()).toHaveLength(0);
    });

    it('should not trace when cmd is not an object', () => {
      const original = vi.fn().mockReturnValue(undefined);
      const patchFn = (instrumentation as any)._patchSendCommand();
      const patched = patchFn(original);

      const fakeThis = { options: { host: 'localhost', port: 6379 } };

      patched.call(fakeThis, 'not-an-object');

      expect(original).toHaveBeenCalled();
      expect(memoryExporter.getFinishedSpans()).toHaveLength(0);
    });
  });

  describe('_patchConnection', () => {
    it('should skip tracing when no parent span and requireParentSpan is true', () => {
      instrumentation.setConfig({ requireParentSpan: true });
      const original = vi.fn().mockReturnValue({ connected: true });

      const patchFn = (instrumentation as any)._patchConnection();
      const patched = patchFn(original);

      const fakeThis = { options: { host: 'localhost', port: 6379 } };

      patched.call(fakeThis);

      expect(original).toHaveBeenCalled();
      expect(memoryExporter.getFinishedSpans()).toHaveLength(0);
    });
  });

  describe('semconv stability', () => {
    it('should initialize semconv stability from env', () => {
      const inst = new IORedisInstrumentation();
      expect((inst as any)._netSemconvStability).toBeDefined();
      expect((inst as any)._dbSemconvStability).toBeDefined();
    });

    it('should allow resetting semconv stability', () => {
      const inst = new IORedisInstrumentation();
      const originalNet = (inst as any)._netSemconvStability;
      inst._setSemconvStabilityFromEnv();
      expect((inst as any)._netSemconvStability).toBe(originalNet);
    });
  });
});

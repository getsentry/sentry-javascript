import * as utils from '@sentry/core';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resourceTimingToSpanAttributes } from '../../src/metrics/resourceTiming';
import * as browserMetricsUtils from '../../src/metrics/utils';

describe('resourceTimingToSpanAttributes', () => {
  let browserPerformanceTimeOriginSpy: MockInstance;
  let extractNetworkProtocolSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    browserPerformanceTimeOriginSpy = vi.spyOn(utils, 'browserPerformanceTimeOrigin');
    extractNetworkProtocolSpy = vi.spyOn(browserMetricsUtils, 'extractNetworkProtocol');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockResourceTiming = (overrides: Partial<PerformanceResourceTiming> = {}): PerformanceResourceTiming => {
    return {
      name: 'https://example.com/api',
      entryType: 'resource',
      startTime: 100,
      duration: 200,
      initiatorType: 'fetch',
      nextHopProtocol: 'h2',
      workerStart: 1,
      redirectStart: 10,
      redirectEnd: 20,
      fetchStart: 25,
      domainLookupStart: 30,
      domainLookupEnd: 35,
      connectStart: 40,
      connectEnd: 50,
      secureConnectionStart: 45,
      requestStart: 55,
      responseStart: 150,
      responseEnd: 200,
      transferSize: 1000,
      encodedBodySize: 800,
      decodedBodySize: 900,
      serverTiming: [],
      workerTiming: [],
      ...overrides,
    } as PerformanceResourceTiming;
  };

  describe('with network protocol information', () => {
    it('extracts network protocol when nextHopProtocol is available', () => {
      const mockResourceTiming = createMockResourceTiming({
        nextHopProtocol: 'h2',
      });

      extractNetworkProtocolSpy.mockReturnValue({
        name: 'http',
        version: '2.0',
      });

      browserPerformanceTimeOriginSpy.mockReturnValue(null);

      // Mock performance.timeOrigin to be undefined to ensure early return
      const originalPerformance = global.performance;
      global.performance = {
        ...originalPerformance,
        timeOrigin: undefined,
      } as any;

      const result = resourceTimingToSpanAttributes(mockResourceTiming);

      expect(extractNetworkProtocolSpy).toHaveBeenCalledWith('h2');
      expect(result).toEqual({
        'network.protocol.version': '2.0',
        'network.protocol.name': 'http',
      });

      // Restore global performance
      global.performance = originalPerformance;
    });

    it('handles different network protocols', () => {
      const mockResourceTiming = createMockResourceTiming({
        nextHopProtocol: 'http/1.1',
      });

      extractNetworkProtocolSpy.mockReturnValue({
        name: 'http',
        version: '1.1',
      });

      browserPerformanceTimeOriginSpy.mockReturnValue(null);

      // Mock performance.timeOrigin to be undefined to ensure early return
      const originalPerformance = global.performance;
      global.performance = {
        ...originalPerformance,
        timeOrigin: undefined,
      } as any;

      const result = resourceTimingToSpanAttributes(mockResourceTiming);

      expect(extractNetworkProtocolSpy).toHaveBeenCalledWith('http/1.1');
      expect(result).toEqual({
        'network.protocol.version': '1.1',
        'network.protocol.name': 'http',
      });

      // Restore global performance
      global.performance = originalPerformance;
    });

    it('extracts network protocol even when nextHopProtocol is empty', () => {
      const mockResourceTiming = createMockResourceTiming({
        nextHopProtocol: '',
      });

      extractNetworkProtocolSpy.mockReturnValue({
        name: '',
        version: 'unknown',
      });

      browserPerformanceTimeOriginSpy.mockReturnValue(null);

      // Mock performance.timeOrigin to be undefined to ensure early return
      const originalPerformance = global.performance;
      global.performance = {
        ...originalPerformance,
        timeOrigin: undefined,
      } as any;

      const result = resourceTimingToSpanAttributes(mockResourceTiming);

      expect(extractNetworkProtocolSpy).toHaveBeenCalledWith('');
      expect(result).toEqual({
        'network.protocol.version': 'unknown',
        'network.protocol.name': '',
      });

      // Restore global performance
      global.performance = originalPerformance;
    });

    it("doesn't extract network protocol when nextHopProtocol is undefined", () => {
      const mockResourceTiming = createMockResourceTiming({
        nextHopProtocol: undefined as any,
      });

      browserPerformanceTimeOriginSpy.mockReturnValue(null);

      // Mock performance.timeOrigin to be undefined to ensure early return
      const originalPerformance = global.performance;
      global.performance = {
        ...originalPerformance,
        timeOrigin: undefined,
      } as any;

      const result = resourceTimingToSpanAttributes(mockResourceTiming);

      expect(extractNetworkProtocolSpy).not.toHaveBeenCalled();
      expect(result).toEqual({});

      // Restore global performance
      global.performance = originalPerformance;
    });
  });

  describe('without browserPerformanceTimeOrigin', () => {
    it('returns only network protocol data when browserPerformanceTimeOrigin is not available', () => {
      const mockResourceTiming = createMockResourceTiming({
        nextHopProtocol: 'h2',
      });

      extractNetworkProtocolSpy.mockReturnValue({
        name: 'http',
        version: '2.0',
      });

      browserPerformanceTimeOriginSpy.mockReturnValue(null);

      // Mock performance.timeOrigin to be undefined to ensure early return
      const originalPerformance = global.performance;
      global.performance = {
        ...originalPerformance,
        timeOrigin: undefined,
      } as any;

      const result = resourceTimingToSpanAttributes(mockResourceTiming);

      expect(result).toEqual({
        'network.protocol.version': '2.0',
        'network.protocol.name': 'http',
      });

      // Restore global performance
      global.performance = originalPerformance;
    });

    it('returns network protocol attributes even when empty string and no browserPerformanceTimeOrigin', () => {
      const mockResourceTiming = createMockResourceTiming({
        nextHopProtocol: '',
      });

      extractNetworkProtocolSpy.mockReturnValue({
        name: '',
        version: 'unknown',
      });

      browserPerformanceTimeOriginSpy.mockReturnValue(null);

      // Mock performance.timeOrigin to be undefined to ensure early return
      const originalPerformance = global.performance;
      global.performance = {
        ...originalPerformance,
        timeOrigin: undefined,
      } as any;

      const result = resourceTimingToSpanAttributes(mockResourceTiming);

      expect(result).toEqual({
        'network.protocol.version': 'unknown',
        'network.protocol.name': '',
      });

      // Restore global performance
      global.performance = originalPerformance;
    });
  });

  describe('with browserPerformanceTimeOrigin', () => {
    beforeEach(() => {
      browserPerformanceTimeOriginSpy.mockReturnValue(1000000); // 1 second in milliseconds
    });

    it('includes all timing attributes when browserPerformanceTimeOrigin is available', () => {
      const mockResourceTiming = createMockResourceTiming({
        nextHopProtocol: 'h2',
        redirectStart: 10,
        redirectEnd: 20,
        workerStart: 22,
        fetchStart: 25,
        domainLookupStart: 30,
        domainLookupEnd: 35,
        connectStart: 40,
        secureConnectionStart: 45,
        connectEnd: 50,
        requestStart: 55,
        responseStart: 150,
        responseEnd: 200,
      });

      extractNetworkProtocolSpy.mockReturnValue({
        name: 'http',
        version: '2.0',
      });

      const result = resourceTimingToSpanAttributes(mockResourceTiming);

      expect(result).toEqual({
        'network.protocol.version': '2.0',
        'network.protocol.name': 'http',
        'http.request.redirect_start': 1000.01, // (1000000 + 10) / 1000
        'http.request.redirect_end': 1000.02, // (1000000 + 20) / 1000
        'http.request.worker_start': 1000.022, // (1000000 + 22) / 1000
        'http.request.fetch_start': 1000.025, // (1000000 + 25) / 1000
        'http.request.domain_lookup_start': 1000.03, // (1000000 + 30) / 1000
        'http.request.domain_lookup_end': 1000.035, // (1000000 + 35) / 1000
        'http.request.connect_start': 1000.04, // (1000000 + 40) / 1000
        'http.request.secure_connection_start': 1000.045, // (1000000 + 45) / 1000
        'http.request.connection_end': 1000.05, // (1000000 + 50) / 1000
        'http.request.request_start': 1000.055, // (1000000 + 55) / 1000
        'http.request.response_start': 1000.15, // (1000000 + 150) / 1000
        'http.request.response_end': 1000.2, // (1000000 + 200) / 1000
        'http.request.time_to_first_byte': 0.15, // 150 / 1000
      });
    });

    it('handles zero timing values', () => {
      /**
       * Most resource timing entries have a 0 value if the resource was requested from
       * a cross-origin source which does not return a matching `Timing-Allow-Origin` header.
       *
       * see: https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Resource_timing#cross-origin_timing_information
       */

      extractNetworkProtocolSpy.mockReturnValue({
        name: '',
        version: 'unknown',
      });

      const mockResourceTiming = createMockResourceTiming({
        nextHopProtocol: '',
        redirectStart: 0,
        redirectEnd: 0,
        workerStart: 0,
        fetchStart: 1000100, // fetchStart is not restricted by `Timing-Allow-Origin` header
        domainLookupStart: 0,
        domainLookupEnd: 0,
        connectStart: 0,
        connectEnd: 0,
        secureConnectionStart: 0,
        requestStart: 0,
        responseStart: 0,
        responseEnd: 1000200, // responseEnd is not restricted by `Timing-Allow-Origin` header
      });

      const result = resourceTimingToSpanAttributes(mockResourceTiming);

      expect(result).toEqual({
        'network.protocol.version': 'unknown',
        'network.protocol.name': '',
        'http.request.redirect_start': 0,
        'http.request.redirect_end': 0,
        'http.request.worker_start': 0,
        'http.request.fetch_start': 2000.1,
        'http.request.domain_lookup_start': 0,
        'http.request.domain_lookup_end': 0,
        'http.request.connect_start': 0,
        'http.request.secure_connection_start': 0,
        'http.request.connection_end': 0,
        'http.request.request_start': 0,
        'http.request.response_start': 0,
        'http.request.response_end': 2000.2,
        'http.request.time_to_first_byte': 0,
      });
    });

    it('combines network protocol and timing attributes', () => {
      const mockResourceTiming = createMockResourceTiming({
        nextHopProtocol: 'http/1.1',
        redirectStart: 5,
        fetchStart: 10,
        domainLookupStart: 15,
        domainLookupEnd: 20,
        connectStart: 25,
        secureConnectionStart: 30,
        connectEnd: 35,
        requestStart: 40,
        responseStart: 80,
        responseEnd: 100,
      });

      extractNetworkProtocolSpy.mockReturnValue({
        name: 'http',
        version: '1.1',
      });

      const result = resourceTimingToSpanAttributes(mockResourceTiming);

      expect(result).toEqual({
        'network.protocol.version': '1.1',
        'network.protocol.name': 'http',
        'http.request.redirect_start': 1000.005,
        'http.request.redirect_end': 1000.02,
        'http.request.worker_start': 1000.001,
        'http.request.fetch_start': 1000.01,
        'http.request.domain_lookup_start': 1000.015,
        'http.request.domain_lookup_end': 1000.02,
        'http.request.connect_start': 1000.025,
        'http.request.secure_connection_start': 1000.03,
        'http.request.connection_end': 1000.035,
        'http.request.request_start': 1000.04,
        'http.request.response_start': 1000.08,
        'http.request.response_end': 1000.1,
        'http.request.time_to_first_byte': 0.08,
      });
    });
  });

  describe('fallback to performance.timeOrigin', () => {
    it('uses performance.timeOrigin when browserPerformanceTimeOrigin returns null', () => {
      // Mock browserPerformanceTimeOrigin to return null for the main check
      browserPerformanceTimeOriginSpy.mockReturnValue(null);

      extractNetworkProtocolSpy.mockReturnValue({
        name: '',
        version: 'unknown',
      });

      const mockResourceTiming = createMockResourceTiming({
        nextHopProtocol: '',
        redirectStart: 20,
        fetchStart: 40,
        domainLookupStart: 60,
        domainLookupEnd: 80,
        connectStart: 100,
        secureConnectionStart: 120,
        connectEnd: 140,
        requestStart: 160,
        responseStart: 300,
        responseEnd: 400,
      });

      const result = resourceTimingToSpanAttributes(mockResourceTiming);

      // When browserPerformanceTimeOrigin returns null, function returns early with only network protocol attributes
      expect(result).toEqual({
        'network.protocol.version': 'unknown',
        'network.protocol.name': '',
      });
    });

    it('uses performance.timeOrigin fallback in getAbsoluteTime when available', () => {
      // Mock browserPerformanceTimeOrigin to return 500000 for the main check
      browserPerformanceTimeOriginSpy.mockReturnValue(500000);

      extractNetworkProtocolSpy.mockReturnValue({
        name: '',
        version: 'unknown',
      });

      const mockResourceTiming = createMockResourceTiming({
        nextHopProtocol: '',
        redirectStart: 20,
        redirectEnd: 30,
        workerStart: 35,
        fetchStart: 40,
        domainLookupStart: 60,
        domainLookupEnd: 80,
        connectStart: 100,
        secureConnectionStart: 120,
        connectEnd: 140,
        requestStart: 160,
        responseStart: 300,
        responseEnd: 400,
      });

      const result = resourceTimingToSpanAttributes(mockResourceTiming);

      expect(result).toEqual({
        'network.protocol.version': 'unknown',
        'network.protocol.name': '',
        'http.request.redirect_start': 500.02, // (500000 + 20) / 1000
        'http.request.redirect_end': 500.03, // (500000 + 30) / 1000
        'http.request.worker_start': 500.035, // (500000 + 35) / 1000
        'http.request.fetch_start': 500.04, // (500000 + 40) / 1000
        'http.request.domain_lookup_start': 500.06, // (500000 + 60) / 1000
        'http.request.domain_lookup_end': 500.08, // (500000 + 80) / 1000
        'http.request.connect_start': 500.1, // (500000 + 100) / 1000
        'http.request.secure_connection_start': 500.12, // (500000 + 120) / 1000
        'http.request.connection_end': 500.14, // (500000 + 140) / 1000
        'http.request.request_start': 500.16, // (500000 + 160) / 1000
        'http.request.response_start': 500.3, // (500000 + 300) / 1000
        'http.request.response_end': 500.4, // (500000 + 400) / 1000
        'http.request.time_to_first_byte': 0.3, // 300 / 1000
      });
    });

    it('handles case when neither browserPerformanceTimeOrigin nor performance.timeOrigin is available', () => {
      browserPerformanceTimeOriginSpy.mockReturnValue(null);

      extractNetworkProtocolSpy.mockReturnValue({
        name: '',
        version: 'unknown',
      });

      // Mock performance.timeOrigin as undefined
      const originalPerformance = global.performance;
      global.performance = {
        ...originalPerformance,
        timeOrigin: undefined,
      } as any;

      const mockResourceTiming = createMockResourceTiming({
        nextHopProtocol: '',
      });

      const result = resourceTimingToSpanAttributes(mockResourceTiming);

      // When neither timing source is available, should return network protocol attributes for empty string
      expect(result).toEqual({
        'network.protocol.version': 'unknown',
        'network.protocol.name': '',
      });

      // Restore global performance
      global.performance = originalPerformance;
    });
  });

  describe('edge cases', () => {
    it("doesn't include undefined timing values", () => {
      browserPerformanceTimeOriginSpy.mockReturnValue(1000000);

      extractNetworkProtocolSpy.mockReturnValue({
        name: '',
        version: 'unknown',
      });

      const mockResourceTiming = createMockResourceTiming({
        nextHopProtocol: '',
        redirectStart: undefined as any,
        redirectEnd: undefined as any,
        fetchStart: undefined as any,
        workerStart: undefined as any,
        domainLookupStart: undefined as any,
        domainLookupEnd: undefined as any,
        connectStart: undefined as any,
        secureConnectionStart: undefined as any,
        connectEnd: undefined as any,
        requestStart: undefined as any,
        responseStart: undefined as any,
        responseEnd: undefined as any,
      });

      const result = resourceTimingToSpanAttributes(mockResourceTiming);

      expect(result).toEqual({
        'network.protocol.version': 'unknown',
        'network.protocol.name': '',
      });
    });

    it('handles very large timing values', () => {
      browserPerformanceTimeOriginSpy.mockReturnValue(1000000);

      extractNetworkProtocolSpy.mockReturnValue({
        name: '',
        version: 'unknown',
      });

      const mockResourceTiming = createMockResourceTiming({
        nextHopProtocol: '',
        redirectStart: 999999,
        fetchStart: 999999,
        domainLookupStart: 999999,
        domainLookupEnd: 999999,
        connectStart: 999999,
        secureConnectionStart: 999999,
        connectEnd: 999999,
        requestStart: 999999,
        responseStart: 999999,
        responseEnd: 999999,
        workerStart: 999999,
      });

      const result = resourceTimingToSpanAttributes(mockResourceTiming);

      expect(result).toEqual({
        'network.protocol.version': 'unknown',
        'network.protocol.name': '',
        'http.request.redirect_start': 1999.999, // (1000000 + 999999) / 1000
        'http.request.redirect_end': 1000.02,
        'http.request.worker_start': 1999.999,
        'http.request.fetch_start': 1999.999,
        'http.request.domain_lookup_start': 1999.999,
        'http.request.domain_lookup_end': 1999.999,
        'http.request.connect_start': 1999.999,
        'http.request.secure_connection_start': 1999.999,
        'http.request.connection_end': 1999.999,
        'http.request.request_start': 1999.999,
        'http.request.response_start': 1999.999,
        'http.request.response_end': 1999.999,
        'http.request.time_to_first_byte': 999.999,
      });
    });
  });
});

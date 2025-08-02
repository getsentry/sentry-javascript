import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope } from '../../../../src/currentScopes';
import {
  completeSpanFromToolResult,
  storeSpanForRequest,
} from '../../../../src/integrations/mcp-server/correlation';
import type { MCPTransport } from '../../../../src/integrations/mcp-server/types';
import { createMockTransport } from './testUtils';

// Mock getCurrentScope
vi.mock('../../../../src/currentScopes', () => ({
  getCurrentScope: vi.fn(),
}));

describe('correlation edge cases', () => {
  let mockSpan: any;

  beforeEach(() => {
    mockSpan = {
      setStatus: vi.fn(),
      setData: vi.fn(),
      end: vi.fn(),
      isRecording: vi.fn().mockReturnValue(true),
    };
    
    (getCurrentScope as any).mockReturnValue({
      getSpan: vi.fn().mockReturnValue(mockSpan),
    });
  });

  describe('WeakMap correlation fallback', () => {
    it('handles null transport gracefully', () => {
      const transport = null as any;
      const requestId = 'test-request-1';
      
      // Should not throw when storing span for null transport
      expect(() => {
        storeSpanForRequest(transport, requestId, mockSpan, 'tools/call');
      }).not.toThrow();
    });

    it('handles undefined transport gracefully', () => {
      const transport = undefined as any;
      const requestId = 'test-request-2';
      
      // Should not throw when storing span for undefined transport
      expect(() => {
        storeSpanForRequest(transport, requestId, mockSpan, 'tools/call');
      }).not.toThrow();
    });

    it('handles non-object transport gracefully', () => {
      const transport = 'not-an-object' as any;
      const requestId = 'test-request-3';
      
      // Should not throw when storing span for string transport
      expect(() => {
        storeSpanForRequest(transport, requestId, mockSpan, 'tools/call');
      }).not.toThrow();
    });

    it('handles number transport gracefully', () => {
      const transport = 123 as any;
      const requestId = 'test-request-4';
      
      // Should not throw when storing span for number transport
      expect(() => {
        storeSpanForRequest(transport, requestId, mockSpan, 'tools/call');
      }).not.toThrow();
    });

    it('handles boolean transport gracefully', () => {
      const transport = true as any;
      const requestId = 'test-request-5';
      
      // Should not throw when storing span for boolean transport
      expect(() => {
        storeSpanForRequest(transport, requestId, mockSpan, 'tools/call');
      }).not.toThrow();
    });

    it('uses fallback map for invalid transports but maintains correlation', () => {
      const invalidTransport1 = null as any;
      const invalidTransport2 = 'string-transport' as any;
      const requestId = 'test-request-6';
      
      // Store span for first invalid transport
      storeSpanForRequest(invalidTransport1, requestId, mockSpan, 'tools/call');
      
      // Complete span from different invalid transport with same request ID
      // This should work because they both use the fallback map
      expect(() => {
        completeSpanFromToolResult(invalidTransport2, requestId, {
          content: [{ type: 'text', text: 'result' }],
        });
      }).not.toThrow();
    });

    it('works normally with valid transport objects', () => {
      const transport = createMockTransport();
      const requestId = 'test-request-7';
      
      // Should work normally with valid transport
      expect(() => {
        storeSpanForRequest(transport, requestId, mockSpan, 'tools/call');
        completeSpanFromToolResult(transport, requestId, {
          content: [{ type: 'text', text: 'result' }],
        });
      }).not.toThrow();
      
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('maintains separate correlation for valid transports', () => {
      const transport1 = createMockTransport();
      const transport2 = createMockTransport();
      const requestId = 'test-request-8';
      
      const mockSpan1 = { ...mockSpan, id: 'span1', end: vi.fn() };
      const mockSpan2 = { ...mockSpan, id: 'span2', end: vi.fn() };
      
      // Store spans for different transports with same request ID
      storeSpanForRequest(transport1, requestId, mockSpan1, 'tools/call');
      storeSpanForRequest(transport2, requestId, mockSpan2, 'tools/call');
      
      // Complete span for transport1 should only affect span1
      completeSpanFromToolResult(transport1, requestId, {
        content: [{ type: 'text', text: 'result1' }],
      });
      
      expect(mockSpan1.end).toHaveBeenCalled();
      expect(mockSpan2.end).not.toHaveBeenCalled();
    });

    it('isolates fallback map from valid transport maps', () => {
      const validTransport = createMockTransport();
      const invalidTransport = null as any;
      const requestId = 'test-request-9';
      
      const mockSpan1 = { ...mockSpan, id: 'valid-span', end: vi.fn() };
      const mockSpan2 = { ...mockSpan, id: 'fallback-span', end: vi.fn() };
      
      // Store spans for both valid and invalid transports
      storeSpanForRequest(validTransport, requestId, mockSpan1, 'tools/call');
      storeSpanForRequest(invalidTransport, requestId, mockSpan2, 'tools/call');
      
      // Complete span for valid transport should only affect valid span
      completeSpanFromToolResult(validTransport, requestId, {
        content: [{ type: 'text', text: 'valid-result' }],
      });
      
      expect(mockSpan1.end).toHaveBeenCalled();
      expect(mockSpan2.end).not.toHaveBeenCalled();
      
      // Complete span for invalid transport should only affect fallback span
      completeSpanFromToolResult(invalidTransport, requestId, {
        content: [{ type: 'text', text: 'fallback-result' }],
      });
      
      expect(mockSpan2.end).toHaveBeenCalled();
    });
  });

  describe('edge case transport objects', () => {
    it('handles transport with null prototype', () => {
      const transport = Object.create(null) as MCPTransport;
      const requestId = 'test-request-10';
      
      // Should not throw with null prototype object
      expect(() => {
        storeSpanForRequest(transport, requestId, mockSpan, 'tools/call');
      }).not.toThrow();
    });

    it('handles frozen transport object', () => {
      const transport = Object.freeze(createMockTransport());
      const requestId = 'test-request-11';
      
      // Should work with frozen object
      expect(() => {
        storeSpanForRequest(transport, requestId, mockSpan, 'tools/call');
        completeSpanFromToolResult(transport, requestId, {
          content: [{ type: 'text', text: 'result' }],
        });
      }).not.toThrow();
      
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('handles transport with circular references', () => {
      const transport = createMockTransport() as any;
      transport.self = transport; // Create circular reference
      const requestId = 'test-request-12';
      
      // Should work with circular references
      expect(() => {
        storeSpanForRequest(transport, requestId, mockSpan, 'tools/call');
        completeSpanFromToolResult(transport, requestId, {
          content: [{ type: 'text', text: 'result' }],
        });
      }).not.toThrow();
      
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });
});
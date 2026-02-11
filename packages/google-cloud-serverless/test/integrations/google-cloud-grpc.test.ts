import { createTransport, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, setCurrentClient } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { GrpcFunction, GrpcFunctionObject, Stub } from '../../src/integrations/google-cloud-grpc';
import { fillGrpcFunction, googleCloudGrpcIntegration } from '../../src/integrations/google-cloud-grpc';

const mockSpanEnd = vi.fn();
const mockStartInactiveSpan = vi.fn();
const mockFill = vi.fn();

let mockClient: NodeClient;

vi.mock('@sentry/core', async () => {
  const original = await vi.importActual('@sentry/core');
  return {
    ...original,
    fill: (obj: any, name: string, replacement: any) => {
      mockFill(obj, name, replacement);
      obj[name] = replacement(obj[name]);
    },
    getClient: () => mockClient,
  };
});

vi.mock('@sentry/node', async () => {
  const original = await vi.importActual('@sentry/node');
  return {
    ...original,
    startInactiveSpan: (ctx: unknown) => {
      mockStartInactiveSpan(ctx);
      return { end: mockSpanEnd };
    },
  };
});

// Need to override mock because the integration loads google-gax as a CJS file
async function mock(mockedUri: string, stub: any) {
  // @ts-expect-error we are using import on purpose
  const { Module } = await import('module');

  // @ts-expect-error test
  Module._load_original = Module._load;
  // @ts-expect-error test
  Module._load = (uri, parent) => {
    if (uri === mockedUri) return stub;
    // @ts-expect-error test
    return Module._load_original(uri, parent);
  };
}

vi.hoisted(
  () =>
    void mock('google-gax', {
      GrpcClient: {
        prototype: {
          createStub: vi.fn(),
        },
      },
    }),
);

describe('GoogleCloudGrpc tracing', () => {
  beforeEach(() => {
    mockClient = new NodeClient({
      tracesSampleRate: 1.0,
      integrations: [],
      dsn: 'https://withAWSServices@domain/123',
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
      stackParser: () => [],
    });

    const integration = googleCloudGrpcIntegration();
    mockClient.addIntegration(integration);
    integration.setup?.(mockClient);

    setCurrentClient(mockClient);
    mockSpanEnd.mockClear();
    mockStartInactiveSpan.mockClear();
    mockFill.mockClear();
  });

  describe('setup', () => {
    test('integration name is correct', () => {
      const integration = googleCloudGrpcIntegration();
      expect(integration.name).toBe('GoogleCloudGrpc');
    });

    test('setupOnce patches GrpcClient.createStub', () => {
      const mockCreateStub = vi.fn();
      const mockGrpcClient = {
        prototype: {
          createStub: mockCreateStub,
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('google-gax').GrpcClient = mockGrpcClient;

      const integration = googleCloudGrpcIntegration();
      integration.setupOnce?.();
      expect(mockCreateStub).toBeDefined();
    });

    test('setupOnce throws when google-gax is not available and not optional', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('google-gax').GrpcClient = undefined;

      const integration = googleCloudGrpcIntegration();
      expect(() => integration.setupOnce?.()).toThrow();
    });

    test('setupOnce does not throw when google-gax is not available and optional', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('google-gax').GrpcClient = undefined;

      const optionalIntegration = googleCloudGrpcIntegration({ optional: true });
      expect(() => optionalIntegration.setupOnce?.()).not.toThrow();
    });
  });

  describe('fillGrpcFunction', () => {
    test('patches unary call methods with tracing', () => {
      const mockStub: Stub = {
        unaryMethod: Object.assign(vi.fn(), {
          requestStream: false,
          responseStream: false,
          originalName: 'unaryMethod',
        } as GrpcFunctionObject),
      };

      const mockEventEmitter = {
        on: vi.fn(),
      };

      (mockStub.unaryMethod as any).apply = vi.fn().mockReturnValue(mockEventEmitter);

      fillGrpcFunction(mockStub, 'test-service', 'unaryMethod');

      const result = (mockStub.unaryMethod as GrpcFunction)();
      expect(result).toBe(mockEventEmitter);
      expect(mockEventEmitter.on).toHaveBeenCalledWith('status', expect.any(Function));
      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        name: 'unary call unaryMethod',
        onlyIfParent: true,
        op: 'grpc.test-service',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.grpc.serverless',
        },
      });
    });

    test('does not patch non-unary call methods', () => {
      const mockStub: Stub = {
        clientStreamMethod: Object.assign(vi.fn(), {
          requestStream: true,
          responseStream: false,
          originalName: 'clientStreamMethod',
        } as GrpcFunctionObject),
        serverStreamMethod: Object.assign(vi.fn(), {
          requestStream: false,
          responseStream: true,
          originalName: 'serverStreamMethod',
        } as GrpcFunctionObject),
        bidiStreamMethod: Object.assign(vi.fn(), {
          requestStream: true,
          responseStream: true,
          originalName: 'bidiStreamMethod',
        } as GrpcFunctionObject),
      };

      fillGrpcFunction(mockStub, 'test-service', 'clientStreamMethod');
      fillGrpcFunction(mockStub, 'test-service', 'serverStreamMethod');
      fillGrpcFunction(mockStub, 'test-service', 'bidiStreamMethod');

      expect(mockStartInactiveSpan).not.toHaveBeenCalled();
    });

    test('does not patch non-function properties', () => {
      const mockStub: Stub = {
        nonFunction: Object.assign(vi.fn(), {
          requestStream: false,
          responseStream: false,
          originalName: 'nonFunction',
        } as GrpcFunctionObject),
      };

      fillGrpcFunction(mockStub, 'test-service', 'nonFunction');
      expect(mockStartInactiveSpan).not.toHaveBeenCalled();
    });

    test('does not patch methods when return value is not an EventEmitter', () => {
      const mockStub: Stub = {
        unaryMethod: Object.assign(vi.fn(), {
          requestStream: false,
          responseStream: false,
          originalName: 'unaryMethod',
        } as GrpcFunctionObject),
      };

      (mockStub.unaryMethod as any).apply = vi.fn().mockReturnValue({ notAnEventEmitter: true });

      fillGrpcFunction(mockStub, 'test-service', 'unaryMethod');

      const result = (mockStub.unaryMethod as GrpcFunction)();
      expect(result).toEqual({ notAnEventEmitter: true });
      expect(mockStartInactiveSpan).not.toHaveBeenCalled();
    });
  });
});

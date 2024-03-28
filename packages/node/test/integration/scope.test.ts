import { getCurrentScope } from '@sentry/core';
import { getClient, getSpanScopes } from '@sentry/opentelemetry';
import { clearGlobalScope } from '../../../core/test/lib/clear-global-scope';

import * as Sentry from '../../src/';
import type { NodeClient } from '../../src/sdk/client';
import { cleanupOtel, mockSdkInit, resetGlobals } from '../helpers/mockSdkInit';

describe('Integration | Scope', () => {
  afterEach(() => {
    cleanupOtel();
  });

  describe.each([
    ['with tracing', true],
    ['without tracing', false],
  ])('%s', (_name, enableTracing) => {
    it('correctly syncs OTEL context & Sentry hub/scope', async () => {
      const beforeSend = jest.fn(() => null);
      const beforeSendTransaction = jest.fn(() => null);

      mockSdkInit({ enableTracing, beforeSend, beforeSendTransaction });

      const client = getClient() as NodeClient;

      const rootScope = getCurrentScope();

      const error = new Error('test error');
      let spanId: string | undefined;
      let traceId: string | undefined;

      rootScope.setTag('tag1', 'val1');

      Sentry.withScope(scope1 => {
        scope1.setTag('tag2', 'val2');

        Sentry.withScope(scope2b => {
          scope2b.setTag('tag3-b', 'val3-b');
        });

        Sentry.withScope(scope2 => {
          scope2.setTag('tag3', 'val3');

          Sentry.startSpan({ name: 'outer' }, span => {
            expect(getSpanScopes(span)?.scope).toBe(enableTracing ? scope2 : undefined);

            spanId = span.spanContext().spanId;
            traceId = span.spanContext().traceId;

            Sentry.setTag('tag4', 'val4');

            Sentry.captureException(error);
          });
        });
      });

      await client.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);

      if (spanId) {
        expect(beforeSend).toHaveBeenCalledWith(
          expect.objectContaining({
            contexts: expect.objectContaining({
              trace: {
                span_id: spanId,
                trace_id: traceId,
                // local span ID from propagation context
                ...(enableTracing ? { parent_span_id: expect.any(String) } : undefined),
              },
            }),
          }),
          {
            event_id: expect.any(String),
            originalException: error,
            syntheticException: expect.any(Error),
          },
        );
      }

      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2',
            tag3: 'val3',
            tag4: 'val4',
          },
          ...(enableTracing ? { transaction: 'outer' } : {}),
        }),
        {
          event_id: expect.any(String),
          originalException: error,
          syntheticException: expect.any(Error),
        },
      );

      if (enableTracing) {
        expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
        // Note: Scope for transaction is taken at `start` time, not `finish` time
        expect(beforeSendTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            contexts: expect.objectContaining({
              trace: {
                data: {
                  'otel.kind': 'INTERNAL',
                  'sentry.origin': 'manual',
                  'sentry.source': 'custom',
                  'sentry.sample_rate': 1,
                },
                span_id: spanId,
                status: 'ok',
                trace_id: traceId,
                origin: 'manual',
                // local span ID from propagation context
                parent_span_id: expect.any(String),
              },
            }),
            spans: [],
            start_timestamp: expect.any(Number),
            tags: {
              tag1: 'val1',
              tag2: 'val2',
              tag3: 'val3',
              tag4: 'val4',
            },
            timestamp: expect.any(Number),
            transaction: 'outer',
            transaction_info: { source: 'custom' },
            type: 'transaction',
          }),
          {
            event_id: expect.any(String),
          },
        );
      }
    });

    it('isolates parallel root scopes', async () => {
      const beforeSend = jest.fn(() => null);
      const beforeSendTransaction = jest.fn(() => null);

      mockSdkInit({ enableTracing, beforeSend, beforeSendTransaction });

      const client = getClient() as NodeClient;
      const rootScope = getCurrentScope();

      const error1 = new Error('test error 1');
      const error2 = new Error('test error 2');
      let spanId1: string | undefined;
      let spanId2: string | undefined;
      let traceId1: string | undefined;
      let traceId2: string | undefined;

      rootScope.setTag('tag1', 'val1');

      Sentry.withScope(scope1 => {
        scope1.setTag('tag2', 'val2a');

        Sentry.withScope(scope2 => {
          scope2.setTag('tag3', 'val3a');

          Sentry.startSpan({ name: 'outer' }, span => {
            spanId1 = span.spanContext().spanId;
            traceId1 = span.spanContext().traceId;

            Sentry.setTag('tag4', 'val4a');

            Sentry.captureException(error1);
          });
        });
      });

      Sentry.withScope(scope1 => {
        scope1.setTag('tag2', 'val2b');

        Sentry.withScope(scope2 => {
          scope2.setTag('tag3', 'val3b');

          Sentry.startSpan({ name: 'outer' }, span => {
            spanId2 = span.spanContext().spanId;
            traceId2 = span.spanContext().traceId;

            Sentry.setTag('tag4', 'val4b');

            Sentry.captureException(error2);
          });
        });
      });

      await client.flush();

      expect(beforeSend).toHaveBeenCalledTimes(2);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: spanId1
              ? {
                  span_id: spanId1,
                  trace_id: traceId1,
                  // local span ID from propagation context
                  ...(enableTracing ? { parent_span_id: expect.any(String) } : undefined),
                }
              : expect.any(Object),
          }),
          tags: {
            tag1: 'val1',
            tag2: 'val2a',
            tag3: 'val3a',
            tag4: 'val4a',
          },
          ...(enableTracing ? { transaction: 'outer' } : {}),
        }),
        {
          event_id: expect.any(String),
          originalException: error1,
          syntheticException: expect.any(Error),
        },
      );

      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: spanId2
              ? {
                  span_id: spanId2,
                  trace_id: traceId2,
                  // local span ID from propagation context
                  ...(enableTracing ? { parent_span_id: expect.any(String) } : undefined),
                }
              : expect.any(Object),
          }),
          tags: {
            tag1: 'val1',
            tag2: 'val2b',
            tag3: 'val3b',
            tag4: 'val4b',
          },
          ...(enableTracing ? { transaction: 'outer' } : {}),
        }),
        {
          event_id: expect.any(String),
          originalException: error2,
          syntheticException: expect.any(Error),
        },
      );

      if (enableTracing) {
        expect(beforeSendTransaction).toHaveBeenCalledTimes(2);
      }
    });
  });

  describe('global scope', () => {
    beforeEach(() => {
      clearGlobalScope();
    });

    it('works before calling init', () => {
      const globalScope = Sentry.getGlobalScope();
      expect(globalScope).toBeDefined();
      // No client attached
      expect(globalScope.getClient()).toBeUndefined();
      // Repeatedly returns the same instance
      expect(Sentry.getGlobalScope()).toBe(globalScope);

      globalScope.setTag('tag1', 'val1');
      globalScope.setTag('tag2', 'val2');

      expect(globalScope.getScopeData().tags).toEqual({ tag1: 'val1', tag2: 'val2' });

      // Now when we call init, the global scope remains intact
      Sentry.init({ dsn: 'https://username@domain/123', defaultIntegrations: false });

      expect(globalScope.getClient()).toBeUndefined();
      expect(Sentry.getGlobalScope()).toBe(globalScope);
      expect(globalScope.getScopeData().tags).toEqual({ tag1: 'val1', tag2: 'val2' });
    });

    it('is applied to events', async () => {
      const beforeSend = jest.fn();
      mockSdkInit({ beforeSend });
      const client = Sentry.getClient();

      const globalScope = Sentry.getGlobalScope();
      globalScope.setTag('tag1', 'val1');
      globalScope.setTag('tag2', 'val2');

      const error = new Error('test error');
      Sentry.captureException(error);

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2',
          },
        }),
        {
          event_id: expect.any(String),
          originalException: error,
          syntheticException: expect.any(Error),
        },
      );
    });
  });

  describe('isolation scope', () => {
    beforeEach(() => {
      resetGlobals();
    });

    it('works before calling init', () => {
      const isolationScope = Sentry.getIsolationScope();
      expect(isolationScope).toBeDefined();
      // No client attached
      expect(isolationScope.getClient()).toBeUndefined();
      // Repeatedly returns the same instance
      expect(Sentry.getIsolationScope()).toBe(isolationScope);

      isolationScope.setTag('tag1', 'val1');
      isolationScope.setTag('tag2', 'val2');

      expect(isolationScope.getScopeData().tags).toEqual({ tag1: 'val1', tag2: 'val2' });

      // Now when we call init, the isolation scope remains intact
      Sentry.init({ dsn: 'https://username@domain/123', defaultIntegrations: false });

      // client is only attached to global scope by default
      expect(isolationScope.getClient()).toBeUndefined();
      expect(Sentry.getIsolationScope()).toBe(isolationScope);
      expect(isolationScope.getScopeData().tags).toEqual({ tag1: 'val1', tag2: 'val2' });
    });

    it('is applied to events', async () => {
      const beforeSend = jest.fn();
      mockSdkInit({ beforeSend });
      const client = Sentry.getClient();

      const isolationScope = Sentry.getIsolationScope();
      isolationScope.setTag('tag1', 'val1');
      isolationScope.setTag('tag2', 'val2');

      const error = new Error('test error');
      Sentry.captureException(error);

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2',
          },
        }),
        {
          event_id: expect.any(String),
          originalException: error,
          syntheticException: expect.any(Error),
        },
      );
    });

    it('withIsolationScope works', async () => {
      const beforeSend = jest.fn();
      mockSdkInit({ beforeSend });
      const client = Sentry.getClient();

      const initialIsolationScope = Sentry.getIsolationScope();
      initialIsolationScope.setTag('tag1', 'val1');
      initialIsolationScope.setTag('tag2', 'val2');

      const initialCurrentScope = Sentry.getCurrentScope();

      const error = new Error('test error');

      Sentry.withIsolationScope(newIsolationScope => {
        newIsolationScope.setTag('tag4', 'val4');
      });

      Sentry.withIsolationScope(newIsolationScope => {
        expect(Sentry.getCurrentScope()).not.toBe(initialCurrentScope);
        expect(Sentry.getIsolationScope()).toBe(newIsolationScope);
        expect(newIsolationScope).not.toBe(initialIsolationScope);

        // Data is forked off original isolation scope
        expect(newIsolationScope.getScopeData().tags).toEqual({ tag1: 'val1', tag2: 'val2' });
        newIsolationScope.setTag('tag3', 'val3');

        Sentry.captureException(error);
      });

      expect(initialIsolationScope.getScopeData().tags).toEqual({ tag1: 'val1', tag2: 'val2' });

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2',
            tag3: 'val3',
          },
        }),
        {
          event_id: expect.any(String),
          originalException: error,
          syntheticException: expect.any(Error),
        },
      );
    });

    it('can be deeply nested', async () => {
      const beforeSend = jest.fn();
      mockSdkInit({ beforeSend });
      const client = Sentry.getClient();

      const initialIsolationScope = Sentry.getIsolationScope();
      initialIsolationScope.setTag('tag1', 'val1');

      const error = new Error('test error');

      Sentry.withIsolationScope(newIsolationScope => {
        newIsolationScope.setTag('tag2', 'val2');

        Sentry.withIsolationScope(newIsolationScope => {
          newIsolationScope.setTag('tag3', 'val3');

          Sentry.withIsolationScope(newIsolationScope => {
            newIsolationScope.setTag('tag4', 'val4');
          });

          Sentry.captureException(error);
        });
      });

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2',
            tag3: 'val3',
          },
        }),
        {
          event_id: expect.any(String),
          originalException: error,
          syntheticException: expect.any(Error),
        },
      );
    });
  });

  describe('current scope', () => {
    beforeEach(() => {
      resetGlobals();
    });

    it('works before calling init', () => {
      const currentScope = Sentry.getCurrentScope();
      expect(currentScope).toBeDefined();
      // No client attached
      expect(currentScope.getClient()).toBeUndefined();
      // Repeatedly returns the same instance
      expect(Sentry.getCurrentScope()).toBe(currentScope);

      currentScope.setTag('tag1', 'val1');
      currentScope.setTag('tag2', 'val2');

      expect(currentScope.getScopeData().tags).toEqual({ tag1: 'val1', tag2: 'val2' });

      // Now when we call init, the current scope remains intact
      Sentry.init({ dsn: 'https://username@domain/123', defaultIntegrations: false });

      // client is attached to current scope
      expect(currentScope.getClient()).toBeDefined();

      expect(Sentry.getCurrentScope()).toBe(currentScope);
      expect(currentScope.getScopeData().tags).toEqual({ tag1: 'val1', tag2: 'val2' });
    });

    it('is applied to events', async () => {
      const beforeSend = jest.fn();
      mockSdkInit({ beforeSend });
      const client = Sentry.getClient();

      const currentScope = Sentry.getCurrentScope();
      currentScope.setTag('tag1', 'val1');
      currentScope.setTag('tag2', 'val2');

      const error = new Error('test error');
      Sentry.captureException(error);

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2',
          },
        }),
        {
          event_id: expect.any(String),
          originalException: error,
          syntheticException: expect.any(Error),
        },
      );
    });

    it('withScope works', async () => {
      const beforeSend = jest.fn();
      mockSdkInit({ beforeSend });
      const client = Sentry.getClient();

      const isolationScope = Sentry.getIsolationScope();
      const initialCurrentScope = Sentry.getCurrentScope();
      initialCurrentScope.setTag('tag1', 'val1');
      initialCurrentScope.setTag('tag2', 'val2');

      const error = new Error('test error');

      Sentry.withScope(newCurrentScope => {
        newCurrentScope.setTag('tag4', 'val4');
      });

      Sentry.withScope(newCurrentScope => {
        expect(Sentry.getCurrentScope()).toBe(newCurrentScope);
        expect(Sentry.getIsolationScope()).toBe(isolationScope);
        expect(newCurrentScope).not.toBe(initialCurrentScope);

        // Data is forked off original isolation scope
        expect(newCurrentScope.getScopeData().tags).toEqual({ tag1: 'val1', tag2: 'val2' });
        newCurrentScope.setTag('tag3', 'val3');

        Sentry.captureException(error);
      });

      expect(initialCurrentScope.getScopeData().tags).toEqual({ tag1: 'val1', tag2: 'val2' });

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2',
            tag3: 'val3',
          },
        }),
        {
          event_id: expect.any(String),
          originalException: error,
          syntheticException: expect.any(Error),
        },
      );
    });

    it('can be deeply nested', async () => {
      const beforeSend = jest.fn();
      mockSdkInit({ beforeSend });
      const client = Sentry.getClient();

      const initialCurrentScope = Sentry.getCurrentScope();
      initialCurrentScope.setTag('tag1', 'val1');

      const error = new Error('test error');

      Sentry.withScope(currentScope => {
        currentScope.setTag('tag2', 'val2');
        expect(Sentry.getCurrentScope()).toBe(currentScope);

        Sentry.withScope(currentScope => {
          currentScope.setTag('tag3', 'val3');
          expect(Sentry.getCurrentScope()).toBe(currentScope);

          Sentry.withScope(currentScope => {
            currentScope.setTag('tag4', 'val4');
            expect(Sentry.getCurrentScope()).toBe(currentScope);
          });

          Sentry.captureException(error);
        });
      });

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2',
            tag3: 'val3',
          },
        }),
        {
          event_id: expect.any(String),
          originalException: error,
          syntheticException: expect.any(Error),
        },
      );
    });

    it('automatically forks with OTEL context', async () => {
      const beforeSend = jest.fn();
      mockSdkInit({ beforeSend });
      const client = Sentry.getClient();

      const initialCurrentScope = Sentry.getCurrentScope();
      initialCurrentScope.setTag('tag1', 'val1');

      const error = new Error('test error');

      Sentry.startSpan({ name: 'outer' }, () => {
        Sentry.getCurrentScope().setTag('tag2', 'val2');

        Sentry.startSpan({ name: 'inner 1' }, () => {
          Sentry.getCurrentScope().setTag('tag3', 'val3');

          Sentry.startSpan({ name: 'inner 2' }, () => {
            Sentry.getCurrentScope().setTag('tag4', 'val4');
          });

          Sentry.captureException(error);
        });
      });

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2',
            tag3: 'val3',
          },
        }),
        {
          event_id: expect.any(String),
          originalException: error,
          syntheticException: expect.any(Error),
        },
      );
    });
  });

  describe('scope merging', () => {
    beforeEach(() => {
      resetGlobals();
    });

    it('merges data from global, isolation and current scope', async () => {
      const beforeSend = jest.fn();
      mockSdkInit({ beforeSend });
      const client = Sentry.getClient();

      Sentry.getGlobalScope().setTag('tag1', 'val1');

      const error = new Error('test error');

      Sentry.withIsolationScope(isolationScope => {
        Sentry.getCurrentScope().setTag('tag2', 'val2a');
        isolationScope.setTag('tag2', 'val2b');
        isolationScope.setTag('tag3', 'val3');

        Sentry.withScope(currentScope => {
          currentScope.setTag('tag4', 'val4');

          Sentry.captureException(error);
        });
      });

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2a',
            tag3: 'val3',
            tag4: 'val4',
          },
        }),
        {
          event_id: expect.any(String),
          originalException: error,
          syntheticException: expect.any(Error),
        },
      );
    });
  });
});

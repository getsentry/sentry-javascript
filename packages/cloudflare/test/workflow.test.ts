/* eslint-disable @typescript-eslint/unbound-method */
import { startSpan } from '@sentry/core';
import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig } from 'cloudflare:workers';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { deterministicTraceIdFromInstanceId, instrumentWorkflowWithSentry } from '../src/workflows';

vi.mock('../src/instrumentations/worker/instrumentEnv', () => ({
  instrumentEnv: vi.fn((env: unknown) => env),
}));

import { instrumentEnv } from '../src/instrumentations/worker/instrumentEnv';

const NODE_MAJOR_VERSION = parseInt(process.versions.node.split('.')[0]!);

const MOCK_STEP_CTX = { attempt: 1, config: { retries: { limit: 3 }, timeout: 60000 } };

const mockStep: WorkflowStep = {
  do: vi
    .fn()
    .mockImplementation(
      async (
        _name: string,
        configOrCallback: WorkflowStepConfig | ((...args: unknown[]) => Promise<any>),
        maybeCallback?: (...args: unknown[]) => Promise<any>,
      ) => {
        const retryLimit = 3;
        let attempt = 0;

        while (attempt <= retryLimit) {
          attempt += 1;
          const stepCtx = { attempt, config: { retries: { limit: retryLimit }, timeout: 60000 } };

          try {
            if (typeof configOrCallback === 'function') {
              return await configOrCallback(stepCtx);
            } else {
              return await (maybeCallback ? maybeCallback(stepCtx) : Promise.resolve());
            }
          } catch {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      },
    ),
  sleep: vi.fn(),
  sleepUntil: vi.fn(),
  waitForEvent: vi.fn(),
};

const mockTransport = {
  send: vi.fn().mockImplementation(() => Promise.resolve({ statusCode: 200 })),
  flush: vi.fn().mockImplementation(() => Promise.resolve(true)),
  close: vi.fn().mockImplementation(() => Promise.resolve(true)),
};

const mockContext: ExecutionContext = {
  waitUntil: vi.fn().mockImplementation(promise => promise),
  passThroughOnException: vi.fn(),
  props: {},
};

function getSentryOptions() {
  return {
    dsn: 'https://8@ingest.sentry.io/4',
    release: '1.0.0',
    tracesSampleRate: 1.0,
    transport: () => mockTransport,
  };
}

type Params = {
  //
};

const INSTANCE_ID = 'ae0ee067-61b3-4852-9219-5d62282270f0';
const SAMPLE_RAND = '0.44116884107728693';
const TRACE_ID = INSTANCE_ID.replace(/-/g, '');

async function drainWaitUntilLikeCloudflareVitestPool(
  waitUntilPromises: Promise<unknown>[],
  timeoutMs = 100,
): Promise<void> {
  while (waitUntilPromises.length > 0) {
    const batch = waitUntilPromises.splice(0);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const result = await Promise.race([
      Promise.allSettled(batch).then(() => 'settled' as const),
      new Promise<'timed-out'>(resolve => {
        timeoutId = setTimeout(() => resolve('timed-out'), timeoutMs);
      }),
    ]);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (result === 'timed-out') {
      throw new Error('Cloudflare Vitest worker pool timed out while draining waitUntil promises');
    }
  }
}

describe.skipIf(NODE_MAJOR_VERSION < 20)('workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('hashStringToUuid hashes a string to a UUID for Sentry trace ID', async () => {
    const UUID_WITHOUT_HYPHENS_REGEX = /^[0-9a-f]{32}$/i;
    expect(await deterministicTraceIdFromInstanceId('s')).toMatch(UUID_WITHOUT_HYPHENS_REGEX);
    expect(await deterministicTraceIdFromInstanceId('test-string')).toMatch(UUID_WITHOUT_HYPHENS_REGEX);
    expect(await deterministicTraceIdFromInstanceId(INSTANCE_ID)).toMatch(UUID_WITHOUT_HYPHENS_REGEX);
  });

  test('Calls expected functions', async () => {
    class BasicTestWorkflow {
      constructor(_ctx: ExecutionContext, _env: unknown) {}

      async run(_event: Readonly<WorkflowEvent<Params>>, step: WorkflowStep): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const files = await step.do('first step', async () => {
          return { files: ['doc_7392_rev3.pdf', 'report_x29_final.pdf'] };
        });
      }
    }

    const TestWorkflowInstrumented = instrumentWorkflowWithSentry(getSentryOptions, BasicTestWorkflow as any);
    const workflow = new TestWorkflowInstrumented(mockContext, {}) as BasicTestWorkflow;
    const event = { payload: {}, timestamp: new Date(), instanceId: INSTANCE_ID };
    await workflow.run(event, mockStep);

    expect(mockStep.do).toHaveBeenCalledTimes(1);
    expect(mockStep.do).toHaveBeenCalledWith('first step', expect.any(Function));
    // We flush after the step.do and at the end of the run
    expect(mockContext.waitUntil).toHaveBeenCalledTimes(2);
    expect(mockContext.waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    expect(mockTransport.send).toHaveBeenCalledTimes(1);
    expect(mockTransport.send).toHaveBeenCalledWith([
      expect.objectContaining({
        trace: expect.objectContaining({
          transaction: 'first step',
          trace_id: TRACE_ID,
          sample_rand: SAMPLE_RAND,
        }),
      }),
      [
        [
          {
            type: 'transaction',
          },
          expect.objectContaining({
            event_id: expect.any(String),
            contexts: {
              trace: expect.objectContaining({
                parent_span_id: undefined,
                span_id: expect.any(String),
                trace_id: TRACE_ID,
                data: expect.objectContaining({
                  'sentry.origin': 'auto.faas.cloudflare.workflow',
                  'sentry.op': 'function.step.do',
                  'sentry.source': 'task',
                  'sentry.sample_rate': 1,
                }),
                op: 'function.step.do',
                status: 'ok',
                origin: 'auto.faas.cloudflare.workflow',
              }),
              cloud_resource: { 'cloud.provider': 'cloudflare' },
              runtime: { name: 'cloudflare' },
            },
            type: 'transaction',
            transaction_info: { source: 'task' },
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
          }),
        ],
      ],
    ]);
  });

  test('workflow step and final flush waitUntil promises can be drained by the Cloudflare Vitest worker pool', async () => {
    const waitUntilPromises: Promise<unknown>[] = [];
    const context: ExecutionContext = {
      waitUntil: vi.fn((promise: Promise<unknown>) => {
        waitUntilPromises.push(promise);
      }),
      passThroughOnException: vi.fn(),
      props: {},
    };

    class WaitUntilWorkflow {
      public constructor(private _ctx: ExecutionContext) {}

      public async run(_event: Readonly<WorkflowEvent<Params>>, step: WorkflowStep): Promise<void> {
        await step.do('waitUntil step', async () => {
          this._ctx.waitUntil(new Promise<void>(resolve => setTimeout(resolve, 0)));
        });
      }
    }

    const TestWorkflowInstrumented = instrumentWorkflowWithSentry(getSentryOptions, WaitUntilWorkflow as any);
    const workflow = new TestWorkflowInstrumented(context, {}) as WaitUntilWorkflow;
    const event = { payload: {}, timestamp: new Date(), instanceId: INSTANCE_ID };

    await workflow.run(event, mockStep);

    await expect(drainWaitUntilLikeCloudflareVitestPool(waitUntilPromises)).resolves.toBeUndefined();
  });

  test('Wraps env with instrumentEnv', async () => {
    class EnvTestWorkflow {
      constructor(_ctx: ExecutionContext, _env: unknown) {}

      async run(_event: Readonly<WorkflowEvent<Params>>, step: WorkflowStep): Promise<void> {
        await step.do('first step', async () => {
          return { ok: true };
        });
      }
    }

    const mockEnv = { SENTRY_DSN: 'https://key@sentry.io/123', MY_SERVICE: {} };
    const TestWorkflowInstrumented = instrumentWorkflowWithSentry(getSentryOptions, EnvTestWorkflow as any);
    new TestWorkflowInstrumented(mockContext, mockEnv as any);

    expect(instrumentEnv).toHaveBeenCalledTimes(1);
    expect(instrumentEnv).toHaveBeenCalledWith(
      mockEnv,
      expect.objectContaining({ dsn: 'https://8@ingest.sentry.io/4' }),
    );
  });

  test('Calls expected functions with non-uuid instance id', async () => {
    class BasicTestWorkflow {
      constructor(_ctx: ExecutionContext, _env: unknown) {}

      async run(_event: Readonly<WorkflowEvent<Params>>, step: WorkflowStep): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const files = await step.do('first step', async () => {
          return { files: ['doc_7392_rev3.pdf', 'report_x29_final.pdf'] };
        });
      }
    }

    const TestWorkflowInstrumented = instrumentWorkflowWithSentry(getSentryOptions, BasicTestWorkflow as any);
    const workflow = new TestWorkflowInstrumented(mockContext, {}) as BasicTestWorkflow;
    const event = { payload: {}, timestamp: new Date(), instanceId: 'ae0ee067' };
    await workflow.run(event, mockStep);

    expect(mockStep.do).toHaveBeenCalledTimes(1);
    expect(mockStep.do).toHaveBeenCalledWith('first step', expect.any(Function));
    // We flush after the step.do and at the end of the run
    expect(mockContext.waitUntil).toHaveBeenCalledTimes(2);
    expect(mockContext.waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    expect(mockTransport.send).toHaveBeenCalledTimes(1);
    expect(mockTransport.send).toHaveBeenCalledWith([
      expect.objectContaining({
        trace: expect.objectContaining({
          transaction: 'first step',
          trace_id: '0d2b6d1743ce6d53af4f5ee416ad5d1b',
          sample_rand: '0.3636987869077592',
        }),
      }),
      [
        [
          {
            type: 'transaction',
          },
          expect.objectContaining({
            event_id: expect.any(String),
            contexts: {
              trace: expect.objectContaining({
                parent_span_id: undefined,
                span_id: expect.any(String),
                trace_id: '0d2b6d1743ce6d53af4f5ee416ad5d1b',
                data: expect.objectContaining({
                  'sentry.origin': 'auto.faas.cloudflare.workflow',
                  'sentry.op': 'function.step.do',
                  'sentry.source': 'task',
                  'sentry.sample_rate': 1,
                }),
                op: 'function.step.do',
                status: 'ok',
                origin: 'auto.faas.cloudflare.workflow',
              }),
              cloud_resource: { 'cloud.provider': 'cloudflare' },
              runtime: { name: 'cloudflare' },
            },
            type: 'transaction',
            transaction_info: { source: 'task' },
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
          }),
        ],
      ],
    ]);
  });

  class ErrorTestWorkflow {
    count = 0;
    constructor(_ctx: ExecutionContext, _env: unknown) {}

    async run(_event: Readonly<WorkflowEvent<Params>>, step: WorkflowStep): Promise<void> {
      await step.do('sometimes error step', async () => {
        this.count += 1;

        if (this.count <= 1) {
          throw new Error('Test error');
        }

        return { files: ['doc_7392_rev3.pdf', 'report_x29_final.pdf'] };
      });
    }
  }

  test('Does not capture error on non-final retry attempt (step eventually succeeds)', async () => {
    // ErrorTestWorkflow fails on first attempt, succeeds on second
    // With step context (attempt 1, limit 3), first failure is not final, so no error captured
    const TestWorkflowInstrumented = instrumentWorkflowWithSentry(getSentryOptions, ErrorTestWorkflow as any);
    const workflow = new TestWorkflowInstrumented(mockContext, {}) as ErrorTestWorkflow;
    const event = { payload: {}, timestamp: new Date(), instanceId: INSTANCE_ID };
    await workflow.run(event, mockStep);

    expect(mockStep.do).toHaveBeenCalledTimes(1);
    expect(mockStep.do).toHaveBeenCalledWith('sometimes error step', expect.any(Function));
    // One flush for the failed attempt, one for the retry success, one at end of run
    expect(mockContext.waitUntil).toHaveBeenCalledTimes(3);
    expect(mockContext.waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    // No error event (not final attempt), only failed transaction + successful retry transaction
    expect(mockTransport.send).toHaveBeenCalledTimes(2);

    // First: the failed transaction (no error event since not final attempt)
    expect(mockTransport.send).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({
        trace: expect.objectContaining({
          transaction: 'sometimes error step',
          trace_id: TRACE_ID,
          sample_rand: SAMPLE_RAND,
        }),
      }),
      [
        [
          {
            type: 'transaction',
          },
          expect.objectContaining({
            event_id: expect.any(String),
            contexts: {
              trace: expect.objectContaining({
                parent_span_id: undefined,
                span_id: expect.any(String),
                trace_id: TRACE_ID,
                data: expect.objectContaining({
                  'sentry.origin': 'auto.faas.cloudflare.workflow',
                  'sentry.op': 'function.step.do',
                  'sentry.source': 'task',
                  'sentry.sample_rate': 1,
                }),
                op: 'function.step.do',
                status: 'internal_error',
                origin: 'auto.faas.cloudflare.workflow',
              }),
              cloud_resource: { 'cloud.provider': 'cloudflare' },
              runtime: { name: 'cloudflare' },
            },
            type: 'transaction',
            transaction_info: { source: 'task' },
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
          }),
        ],
      ],
    ]);

    // Second: the successful transaction
    expect(mockTransport.send).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({
        trace: expect.objectContaining({
          transaction: 'sometimes error step',
          trace_id: TRACE_ID,
          sample_rand: SAMPLE_RAND,
        }),
      }),
      [
        [
          {
            type: 'transaction',
          },
          expect.objectContaining({
            event_id: expect.any(String),
            contexts: {
              trace: expect.objectContaining({
                parent_span_id: undefined,
                span_id: expect.any(String),
                trace_id: TRACE_ID,
                data: expect.objectContaining({
                  'sentry.origin': 'auto.faas.cloudflare.workflow',
                  'sentry.op': 'function.step.do',
                  'sentry.source': 'task',
                  'sentry.sample_rate': 1,
                }),
                op: 'function.step.do',
                status: 'ok',
                origin: 'auto.faas.cloudflare.workflow',
              }),
              cloud_resource: { 'cloud.provider': 'cloudflare' },
              runtime: { name: 'cloudflare' },
            },
            type: 'transaction',
            transaction_info: { source: 'task' },
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
          }),
        ],
      ],
    ]);
  });

  test('emits a single error event on final retry attempt (with step context)', async () => {
    const retryLimit = 2;
    // Mock that always throws — simulates a step that fails through every retry
    // Passes step context with incrementing attempt and config.retries.limit
    const alwaysFailStep: WorkflowStep = {
      do: vi
        .fn()
        .mockImplementation(
          async (
            _name: string,
            configOrCallback: WorkflowStepConfig | ((...args: unknown[]) => Promise<any>),
            maybeCallback?: (...args: unknown[]) => Promise<any>,
          ) => {
            const callback = (typeof configOrCallback === 'function' ? configOrCallback : maybeCallback)!;
            // Simulate attempts: 1 (initial) + 2 retries = 3 total, then surface the final error
            let lastError: unknown;
            for (let attempt = 1; attempt <= retryLimit + 1; attempt++) {
              try {
                return await callback({ attempt, config: { retries: { limit: retryLimit }, timeout: 60000 } });
              } catch (err) {
                lastError = err;
              }
            }
            throw lastError;
          },
        ),
      sleep: vi.fn(),
      sleepUntil: vi.fn(),
      waitForEvent: vi.fn(),
    };

    class AlwaysFailWorkflow {
      constructor(_ctx: ExecutionContext, _env: unknown) {}

      async run(_event: Readonly<WorkflowEvent<Params>>, step: WorkflowStep): Promise<void> {
        await step.do('always failing step', async () => {
          throw new Error('boom');
        });
      }
    }

    const TestWorkflowInstrumented = instrumentWorkflowWithSentry(() => getSentryOptions(), AlwaysFailWorkflow as any);
    const workflow = new TestWorkflowInstrumented(mockContext, {}) as AlwaysFailWorkflow;
    const event = { payload: {}, timestamp: new Date(), instanceId: INSTANCE_ID };
    await expect(workflow.run(event, alwaysFailStep)).rejects.toThrow('boom');

    // Exactly one error event on the final attempt (attempt 3 > limit 2)
    const errorEnvelopes = mockTransport.send.mock.calls.filter(call => {
      const items = (call[0] as any)[1] as any[];
      return items.some(i => i[0].type === 'event');
    });
    expect(errorEnvelopes).toHaveLength(1);
    expect(errorEnvelopes[0]![0][1][0][1]).toMatchObject({
      exception: {
        values: [
          expect.objectContaining({
            type: 'Error',
            value: 'boom',
            mechanism: { type: 'auto.faas.cloudflare.workflow', handled: true },
          }),
        ],
      },
    });
  });

  test('emits error per attempt on older Cloudflare without step context', async () => {
    // Mock that always throws — simulates a step that fails through every retry
    // Does NOT pass step context (simulates older Cloudflare versions)
    const alwaysFailStepNoContext: WorkflowStep = {
      do: vi
        .fn()
        .mockImplementation(
          async (
            _name: string,
            configOrCallback: WorkflowStepConfig | ((...args: unknown[]) => Promise<any>),
            maybeCallback?: (...args: unknown[]) => Promise<any>,
          ) => {
            const callback = (typeof configOrCallback === 'function' ? configOrCallback : maybeCallback)!;
            // Simulate 3 retry attempts that all fail, no step context passed
            let lastError: unknown;
            for (let i = 0; i < 3; i++) {
              try {
                return await callback();
              } catch (err) {
                lastError = err;
              }
            }
            throw lastError;
          },
        ),
      sleep: vi.fn(),
      sleepUntil: vi.fn(),
      waitForEvent: vi.fn(),
    };

    class AlwaysFailWorkflow {
      constructor(_ctx: ExecutionContext, _env: unknown) {}

      async run(_event: Readonly<WorkflowEvent<Params>>, step: WorkflowStep): Promise<void> {
        await step.do('always failing step', async () => {
          throw new Error('boom');
        });
      }
    }

    const TestWorkflowInstrumented = instrumentWorkflowWithSentry(() => getSentryOptions(), AlwaysFailWorkflow as any);
    const workflow = new TestWorkflowInstrumented(mockContext, {}) as AlwaysFailWorkflow;
    const event = { payload: {}, timestamp: new Date(), instanceId: INSTANCE_ID };
    await expect(workflow.run(event, alwaysFailStepNoContext)).rejects.toThrow('boom');

    // 3 error events, one per attempt (legacy behavior without step context)
    const errorEnvelopes = mockTransport.send.mock.calls.filter(call => {
      const items = (call[0] as any)[1] as any[];
      return items.some(i => i[0].type === 'event');
    });
    expect(errorEnvelopes).toHaveLength(3);
  });

  test('Sampled random via instanceId (no events when sampled out and no final error)', async () => {
    // ErrorTestWorkflow fails once then succeeds. With step context, non-final errors
    // are not captured. With low tracesSampleRate, transactions are also not sent.
    const TestWorkflowInstrumented = instrumentWorkflowWithSentry(
      // Override the tracesSampleRate to 0.4 to be below the sampleRand
      // calculated from the instanceId
      () => ({ ...getSentryOptions(), tracesSampleRate: 0.4 }),
      ErrorTestWorkflow as any,
    );
    const workflow = new TestWorkflowInstrumented(mockContext, {}) as ErrorTestWorkflow;
    const event = { payload: {}, timestamp: new Date(), instanceId: INSTANCE_ID };
    await workflow.run(event, mockStep);

    expect(mockStep.do).toHaveBeenCalledTimes(1);
    expect(mockStep.do).toHaveBeenCalledWith('sometimes error step', expect.any(Function));
    expect(mockContext.waitUntil).toHaveBeenCalledTimes(3);
    expect(mockContext.waitUntil).toHaveBeenCalledWith(expect.any(Promise));

    // No error events (not final attempt) and no transactions (sampled out)
    expect(mockTransport.send).toHaveBeenCalledTimes(0);
  });

  test('Forwards step context (ctx) to user callback', async () => {
    const callbackSpy = vi.fn().mockResolvedValue({ ok: true });

    class CtxTestWorkflow {
      constructor(_ctx: ExecutionContext, _env: unknown) {}

      async run(_event: Readonly<WorkflowEvent<Params>>, step: WorkflowStep): Promise<void> {
        await step.do('ctx step', callbackSpy);
      }
    }

    const TestWorkflowInstrumented = instrumentWorkflowWithSentry(getSentryOptions, CtxTestWorkflow as any);
    const workflow = new TestWorkflowInstrumented(mockContext, {}) as CtxTestWorkflow;
    const event = { payload: {}, timestamp: new Date(), instanceId: INSTANCE_ID };
    await workflow.run(event, mockStep);

    expect(callbackSpy).toHaveBeenCalledTimes(1);
    expect(callbackSpy).toHaveBeenCalledWith(MOCK_STEP_CTX);
  });

  test('Step.do span becomes child of surrounding custom span', async () => {
    class ParentChildWorkflow {
      constructor(_ctx: ExecutionContext, _env: unknown) {}

      async run(_event: Readonly<WorkflowEvent<Params>>, step: WorkflowStep): Promise<void> {
        await startSpan({ name: 'custom span' }, async () => {
          await step.do('first step', async () => {
            return { files: ['a'] };
          });
        });
      }
    }

    const TestWorkflowInstrumented = instrumentWorkflowWithSentry(getSentryOptions, ParentChildWorkflow as any);
    const workflow = new TestWorkflowInstrumented(mockContext, {}) as ParentChildWorkflow;
    const event = { payload: {}, timestamp: new Date(), instanceId: INSTANCE_ID };
    await workflow.run(event, mockStep);

    // Flush after step.do and at end of run
    expect(mockContext.waitUntil).toHaveBeenCalledTimes(2);
    expect(mockTransport.send).toHaveBeenCalledTimes(1);

    const sendArg = mockTransport.send.mock.calls[0]![0];
    const items = sendArg[1] as any[];
    const rootSpanItem = items.find(i => i[0].type === 'transaction');
    expect(rootSpanItem).toBeDefined();
    const rootSpan = rootSpanItem[1];

    expect(rootSpan.transaction).toBe('custom span');
    const rootSpanId = rootSpan.contexts.trace.span_id;

    // Child span for the step.do with the custom span as parent
    const stepSpan = rootSpan.spans.find((s: any) => s.description === 'first step' && s.op === 'function.step.do');
    expect(stepSpan).toBeDefined();
    expect(stepSpan.parent_span_id).toBe(rootSpanId);
  });
});

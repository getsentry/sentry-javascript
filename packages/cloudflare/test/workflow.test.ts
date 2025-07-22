/* eslint-disable @typescript-eslint/unbound-method */
import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig } from 'cloudflare:workers';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { instrumentWorkflowWithSentry } from '../src/workflows';

const mockStep: WorkflowStep = {
  do: vi
    .fn()
    .mockImplementation(
      async (
        _name: string,
        configOrCallback: WorkflowStepConfig | (() => Promise<any>),
        maybeCallback?: () => Promise<any>,
      ) => {
        let count = 0;

        while (count <= 5) {
          count += 1;

          try {
            if (typeof configOrCallback === 'function') {
              return await configOrCallback();
            } else {
              return await (maybeCallback ? maybeCallback() : Promise.resolve());
            }
          } catch (error) {
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

describe('workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(mockContext.waitUntil).toHaveBeenCalledTimes(1);
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
              trace: {
                parent_span_id: undefined,
                span_id: expect.any(String),
                trace_id: TRACE_ID,
                data: {
                  'sentry.origin': 'auto.faas.cloudflare.workflow',
                  'sentry.op': 'function.step.do',
                  'sentry.source': 'task',
                  'sentry.sample_rate': 1,
                },
                op: 'function.step.do',
                status: 'ok',
                origin: 'auto.faas.cloudflare.workflow',
              },
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
    expect(mockContext.waitUntil).toHaveBeenCalledTimes(1);
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
              trace: {
                parent_span_id: undefined,
                span_id: expect.any(String),
                trace_id: '0d2b6d1743ce6d53af4f5ee416ad5d1b',
                data: {
                  'sentry.origin': 'auto.faas.cloudflare.workflow',
                  'sentry.op': 'function.step.do',
                  'sentry.source': 'task',
                  'sentry.sample_rate': 1,
                },
                op: 'function.step.do',
                status: 'ok',
                origin: 'auto.faas.cloudflare.workflow',
              },
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

  test('Captures step errors', async () => {
    const TestWorkflowInstrumented = instrumentWorkflowWithSentry(getSentryOptions, ErrorTestWorkflow as any);
    const workflow = new TestWorkflowInstrumented(mockContext, {}) as ErrorTestWorkflow;
    const event = { payload: {}, timestamp: new Date(), instanceId: INSTANCE_ID };
    await workflow.run(event, mockStep);

    expect(mockStep.do).toHaveBeenCalledTimes(1);
    expect(mockStep.do).toHaveBeenCalledWith('sometimes error step', expect.any(Function));
    expect(mockContext.waitUntil).toHaveBeenCalledTimes(2);
    expect(mockContext.waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    expect(mockTransport.send).toHaveBeenCalledTimes(3);

    // First we should get the error event
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
            type: 'event',
          },
          expect.objectContaining({
            event_id: expect.any(String),
            contexts: {
              trace: {
                parent_span_id: undefined,
                span_id: expect.any(String),
                trace_id: TRACE_ID,
              },
              cloud_resource: { 'cloud.provider': 'cloudflare' },
              runtime: { name: 'cloudflare' },
            },
            timestamp: expect.any(Number),
            exception: {
              values: [
                expect.objectContaining({
                  type: 'Error',
                  value: 'Test error',
                  mechanism: { type: 'cloudflare', handled: true },
                }),
              ],
            },
          }),
        ],
      ],
    ]);

    // The the failed transaction
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
              trace: {
                parent_span_id: undefined,
                span_id: expect.any(String),
                trace_id: TRACE_ID,
                data: {
                  'sentry.origin': 'auto.faas.cloudflare.workflow',
                  'sentry.op': 'function.step.do',
                  'sentry.source': 'task',
                  'sentry.sample_rate': 1,
                },
                op: 'function.step.do',
                status: 'internal_error',
                origin: 'auto.faas.cloudflare.workflow',
              },
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

    // The the successful transaction
    expect(mockTransport.send).toHaveBeenNthCalledWith(3, [
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
              trace: {
                parent_span_id: undefined,
                span_id: expect.any(String),
                trace_id: TRACE_ID,
                data: {
                  'sentry.origin': 'auto.faas.cloudflare.workflow',
                  'sentry.op': 'function.step.do',
                  'sentry.source': 'task',
                  'sentry.sample_rate': 1,
                },
                op: 'function.step.do',
                status: 'ok',
                origin: 'auto.faas.cloudflare.workflow',
              },
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

  test('Sampled random via instanceId', async () => {
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
    expect(mockContext.waitUntil).toHaveBeenCalledTimes(2);
    expect(mockContext.waitUntil).toHaveBeenCalledWith(expect.any(Promise));

    // We should get the error event and then nothing else. No transactions
    // should be sent
    expect(mockTransport.send).toHaveBeenCalledTimes(1);

    expect(mockTransport.send).toHaveBeenCalledWith([
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
            type: 'event',
          },
          expect.objectContaining({
            event_id: expect.any(String),
            contexts: {
              trace: {
                parent_span_id: undefined,
                span_id: expect.any(String),
                trace_id: TRACE_ID,
              },
              cloud_resource: { 'cloud.provider': 'cloudflare' },
              runtime: { name: 'cloudflare' },
            },
            timestamp: expect.any(Number),
            exception: {
              values: [
                expect.objectContaining({
                  type: 'Error',
                  value: 'Test error',
                }),
              ],
            },
          }),
        ],
      ],
    ]);
  });
});

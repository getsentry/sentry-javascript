import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('Claude Code Agent SDK integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // Expected span structure for basic invocation (sendDefaultPii: false)
  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE = {
    transaction: 'invoke_agent claude-code',
    spans: expect.arrayContaining([
      // LLM chat span (child of agent span)
      expect.objectContaining({
        data: expect.objectContaining({
          'sentry.origin': 'auto.ai.claude_code',
          'sentry.op': 'gen_ai.chat',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-sonnet-4-20250514',
          'gen_ai.operation.name': 'chat',
          'gen_ai.response.id': expect.stringMatching(/^resp_/),
          'gen_ai.response.model': 'claude-sonnet-4-20250514',
          'gen_ai.usage.input_tokens': expect.any(Number),
          'gen_ai.usage.output_tokens': expect.any(Number),
          'gen_ai.usage.total_tokens': expect.any(Number),
          // NO response.text (sendDefaultPii: false)
        }),
        description: expect.stringMatching(/^chat claude-sonnet/),
        op: 'gen_ai.chat',
        origin: 'auto.ai.claude_code',
        status: 'ok',
      }),
    ]),
  };

  // Expected span structure with PII enabled
  const EXPECTED_TRANSACTION_WITH_PII = {
    transaction: 'invoke_agent claude-code',
    spans: expect.arrayContaining([
      // LLM span with response text
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.response.text': expect.stringContaining('Hello!'),
          'gen_ai.response.id': expect.stringMatching(/^resp_/),
          'gen_ai.usage.input_tokens': expect.any(Number),
        }),
        op: 'gen_ai.chat',
        status: 'ok',
      }),
    ]),
  };

  // Expected spans with tools
  const EXPECTED_TRANSACTION_WITH_TOOLS = {
    transaction: 'invoke_agent claude-code',
    spans: expect.arrayContaining([
      // Tool execution span - Read (function type)
      expect.objectContaining({
        data: expect.objectContaining({
          'sentry.op': 'gen_ai.execute_tool',
          'sentry.origin': 'auto.ai.claude_code',
          'gen_ai.tool.name': 'Read',
          'gen_ai.tool.type': 'function',
        }),
        description: 'execute_tool Read',
        op: 'gen_ai.execute_tool',
        origin: 'auto.ai.claude_code',
        status: 'ok',
      }),

      // LLM chat spans (should have multiple from the conversation)
      expect.objectContaining({
        op: 'gen_ai.chat',
        status: 'ok',
      }),
    ]),
  };

  // Expected spans with extension tools
  const EXPECTED_TRANSACTION_WITH_EXTENSION_TOOLS = {
    transaction: 'invoke_agent claude-code',
    spans: expect.arrayContaining([
      // WebSearch - extension type
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.tool.name': 'WebSearch',
          'gen_ai.tool.type': 'extension',
        }),
        description: 'execute_tool WebSearch',
        op: 'gen_ai.execute_tool',
      }),

      // WebFetch - extension type
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.tool.name': 'WebFetch',
          'gen_ai.tool.type': 'extension',
        }),
        description: 'execute_tool WebFetch',
        op: 'gen_ai.execute_tool',
      }),
    ]),
  };

  // Expected error handling
  const EXPECTED_ERROR_EVENT = {
    exception: {
      values: [
        expect.objectContaining({
          type: 'Error',
          value: expect.stringMatching(/Rate limit exceeded|Agent initialization failed/),
          mechanism: {
            type: 'auto.ai.claude_code',
            handled: false,
          },
        }),
      ],
    },
  };

  // Basic tests with default PII settings
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates claude-code related spans with sendDefaultPii: false', async () => {
      await createRunner().expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE }).start().completed();
    });
  });

  // Tests with PII enabled
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('records input messages and response text with sendDefaultPii: true', async () => {
      await createRunner().expect({ transaction: EXPECTED_TRANSACTION_WITH_PII }).start().completed();
    });
  });

  // Tests with custom options
  createEsmAndCjsTests(__dirname, 'scenario-with-options.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('respects custom recordInputs/recordOutputs options', async () => {
      await createRunner()
        .expect({
          transaction: {
            spans: expect.arrayContaining([
              expect.objectContaining({
                data: expect.objectContaining({
                  // recordInputs: true
                  'gen_ai.request.messages': expect.any(String),
                }),
                op: 'gen_ai.invoke_agent',
              }),
              expect.objectContaining({
                data: expect.not.objectContaining({
                  // recordOutputs: false
                  'gen_ai.response.text': expect.anything(),
                }),
                op: 'gen_ai.chat',
              }),
            ]),
          },
        })
        .start()
        .completed();
    });
  });

  // Tool execution tests
  createEsmAndCjsTests(__dirname, 'scenario-tools.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates tool execution spans with correct types', async () => {
      await createRunner().expect({ transaction: EXPECTED_TRANSACTION_WITH_TOOLS }).start().completed();
    });

    test('classifies extension tools correctly', async () => {
      await createRunner().expect({ transaction: EXPECTED_TRANSACTION_WITH_EXTENSION_TOOLS }).start().completed();
    });
  });

  // Error handling tests
  createEsmAndCjsTests(__dirname, 'scenario-errors.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures errors with correct mechanism type', async () => {
      await createRunner().expect({ event: EXPECTED_ERROR_EVENT }).start().completed();
    });

    test('sets span status to error on failure', async () => {
      await createRunner()
        .expect({
          transaction: {
            spans: expect.arrayContaining([
              expect.objectContaining({
                op: 'gen_ai.invoke_agent',
                status: 'internal_error',
              }),
            ]),
          },
        })
        .start()
        .completed();
    });
  });
});

import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { supports } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// `@earendil-works/pi-ai` declares `engines.node >= 22.19`, so it can't live in the package's root
// `devDependencies` (that would break `yarn install` on the 20.19 CI matrix). Install it per-suite
// instead, guarded by the `min: 22` skip below.
const PI_AI_DEPENDENCIES = {
  additionalDependencies: {
    '@earendil-works/pi-ai': '^1.4.0',
  },
};

describe.runIf(supports({ min: 22 }))('pi-ai integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      // `@earendil-works/pi-ai` is ESM-only, so there is no CJS variant of this scenario to run.
      if (mode === 'cjs') {
        return;
      }

      test('traces the requests sent through a `Models` collection and the standalone functions', async () => {
        await createRunner()
          .unordered()
          .expect({
            span: container => {
              const spans = container.items;
              const root = spans.find(span => span.is_segment)!;
              expect(root.name).toBe('pi-ai-test');

              // One span per request: `complete` awaits a `stream` of its own, and no provider SDK
              // reports the request a second time.
              const chats = spans
                .filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_CHAT)
                .sort((a, b) => a.start_timestamp - b.start_timestamp);
              expect(chats.map(chat => chat.name)).toEqual([
                'chat faux-model',
                'chat faux-model',
                'chat compat-model',
                'chat compat-model',
              ]);

              for (const chat of chats) {
                expect(chat.parent_span_id).toBe(root.span_id);
                expect(chat.attributes[SENTRY_ORIGIN]?.value).toBe('auto.ai.pi_ai');
                expect(chat.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('chat');
                expect(chat.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBeGreaterThan(0);
                expect(chat.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBeGreaterThan(0);
              }

              const [toolCall, answer, compatComplete, compatStream] = chats;
              expect(toolCall!.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe('faux');
              expect(toolCall!.attributes[GEN_AI_REQUEST_MODEL]?.value).toBe('faux-model');
              expect(toolCall!.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);
              expect(toolCall!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]?.value).toBe('You are a weather assistant.');
              expect(toolCall!.attributes[GEN_AI_TOOL_DEFINITIONS]?.value).toContain('get_weather');
              expect(toolCall!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).toBe('["tool_call"]');
              expect(JSON.parse(String(toolCall!.attributes[GEN_AI_INPUT_MESSAGES]?.value))).toEqual([
                { role: 'user', parts: [{ type: 'text', content: 'What is the weather in Berlin?' }] },
              ]);
              expect(JSON.parse(String(toolCall!.attributes[GEN_AI_OUTPUT_MESSAGES]?.value))).toEqual([
                {
                  role: 'assistant',
                  parts: [{ type: 'tool_call', id: 'call_1', name: 'get_weather', arguments: '{"city":"Berlin"}' }],
                  finish_reason: 'tool_call',
                },
              ]);

              expect(answer!.attributes[GEN_AI_RESPONSE_STREAMING]).toBeUndefined();
              expect(answer!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).toBe('["stop"]');
              expect(
                JSON.parse(String(answer!.attributes[GEN_AI_INPUT_MESSAGES]?.value)).map(
                  (message: { role: string }) => message.role,
                ),
              ).toEqual(['user', 'assistant', 'tool']);

              expect(compatComplete!.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe('compat-faux');
              expect(compatComplete!.attributes[GEN_AI_RESPONSE_STREAMING]).toBeUndefined();
              expect(compatStream!.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);
              expect(compatStream!.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).toContain('Goodbye.');
            },
          })
          .start()
          .completed();
      });
    },
    PI_AI_DEPENDENCIES,
  );
});

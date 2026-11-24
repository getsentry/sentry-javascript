import type { Event, SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';
import { dirname } from 'node:path';

const scenarioDirectory = dirname(__dirname);

const EXPECTED_ORIGIN = 'auto.ai.google_genai';

describe('Google GenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(scenarioDirectory, 'scenario-streaming.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates google genai streaming spans with genAI recording disabled', async () => {
      let receivedEvent: Event | undefined;
      let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        // The provider surfaces blocked content within the stream and never returns it to the caller as
        // a thrown error, so the instrumentation intentionally captures it as an event.
        .unordered()
        .expect({
          event: event => {
            receivedEvent = event;
          },
        })
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
            receivedSpans = container.items;
          },
        })
        .start()
        .completed();

      expect(receivedEvent).toMatchObject({
        event_id: expect.any(String),
        exception: {
          values: [
            {
              value: 'Content blocked: The prompt was blocked due to safety concerns',
              mechanism: { type: 'auto.ai.google_genai', handled: false },
            },
          ],
        },
      });

      const spans = receivedSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.google_genai');
      expect(spans).toHaveLength(4);
      expect(spans.map(span => span.name).sort()).toEqual([
        'chat gemini-1.5-pro',
        'generate_content blocked-model',
        'generate_content error-model',
        'generate_content gemini-1.5-flash',
      ]);

      const generateContentSpan = spans.find(span => span.name === 'generate_content gemini-1.5-flash');
      expect(generateContentSpan!.status).toBe('ok');
      expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
      expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
      expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK]?.value).toEqual(expect.any(Number));
      expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
      expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
      expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
      expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_ID].value).toBe('mock-response-streaming-id');
      expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('gemini-1.5-pro');
      expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS].value).toBe('["STOP"]');
      expect(generateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
      expect(generateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
      expect(generateContentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(22);

      const chatSpan = spans.find(span => span.name === 'chat gemini-1.5-pro');
      expect(chatSpan!.status).toBe('ok');
      expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
      expect(chatSpan!.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
      // Given once to `chats.create()` and reused for every message the chat sends.
      expect(chatSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.8);
      expect(chatSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
      expect(chatSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(150);
      expect(chatSpan!.attributes[GEN_AI_RESPONSE_ID].value).toBe('mock-response-streaming-id');
      expect(chatSpan!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('gemini-1.5-pro');

      const blockedSpan = spans.find(span => span.name === 'generate_content blocked-model');
      expect(blockedSpan!.status).toBe('error');
      expect(blockedSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
      expect(blockedSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');

      const errorSpan = spans.find(span => span.name === 'generate_content error-model');
      expect(errorSpan!.status).toBe('error');
      expect(errorSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
      expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
    });
  });

  createEsmAndCjsTests(scenarioDirectory, 'scenario-streaming.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates google genai streaming spans with genAI recording enabled', async () => {
      let receivedEvent: Event | undefined;
      let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        // The provider surfaces blocked content within the stream and never returns it to the caller as
        // a thrown error, so the instrumentation intentionally captures it as an event.
        .unordered()
        .expect({
          event: event => {
            receivedEvent = event;
          },
        })
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
            receivedSpans = container.items;
          },
        })
        .start()
        .completed();

      expect(receivedEvent).toMatchObject({
        event_id: expect.any(String),
        exception: {
          values: [
            {
              value: 'Content blocked: The prompt was blocked due to safety concerns',
              mechanism: { type: 'auto.ai.google_genai', handled: false },
            },
          ],
        },
      });

      const spans = receivedSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.google_genai');
      expect(spans).toHaveLength(4);
      expect(spans.map(span => span.name).sort()).toEqual([
        'chat gemini-1.5-pro',
        'generate_content blocked-model',
        'generate_content error-model',
        'generate_content gemini-1.5-flash',
      ]);

      const generateContentSpan = spans.find(span => span.name === 'generate_content gemini-1.5-flash');
      expect(generateContentSpan!.status).toBe('ok');
      expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
      expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
      expect(generateContentSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
      expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
      expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
      expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
      expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS].value).toBe('["STOP"]');

      const chatSpan = spans.find(span => span.name === 'chat gemini-1.5-pro');
      expect(chatSpan!.status).toBe('ok');
      expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
      expect(chatSpan!.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
      expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
      // Given once to `chats.create()` and reused for every message the chat sends.
      expect(chatSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.8);
      expect(chatSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
      expect(chatSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(150);
      expect(chatSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS].value).toBe('["STOP"]');

      const blockedSpan = spans.find(span => span.name === 'generate_content blocked-model');
      expect(blockedSpan!.status).toBe('error');
      expect(blockedSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
      expect(blockedSpan!.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
      expect(blockedSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
      expect(blockedSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);

      const errorSpan = spans.find(span => span.name === 'generate_content error-model');
      expect(errorSpan!.status).toBe('error');
      expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
      expect(errorSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
      expect(errorSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
    });
  });

  createEsmAndCjsTests(
    scenarioDirectory,
    'scenario-stream-midway-error.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('marks the span as errored when the stream fails midway, but not when the caller breaks early', async () => {
        await createRunner()
          .unordered()
          .expect({
            span: container => {
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === EXPECTED_ORIGIN);
              expect(spans).toHaveLength(6);

              const midwaySpan = spans.find(span => span.name === 'generate_content midway-error');
              expect(midwaySpan!.status).toBe('error');
              expect(midwaySpan!.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);
              expect(midwaySpan!.attributes[GEN_AI_RESPONSE_ID]?.value).toBe('mock-midway-response-id');
              expect(midwaySpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(8);
              expect(midwaySpan!.attributes[GEN_AI_RESPONSE_TEXT]?.value).toBe('This stream will be cut off');

              const earlyBreakSpan = spans.find(span => span.name === 'generate_content early-break');
              expect(earlyBreakSpan!.status).toBe('ok');
              expect(earlyBreakSpan!.attributes[GEN_AI_RESPONSE_TEXT]?.value).toBe('This stream will ');

              // `cancelled` is sent as `ok` under span streaming, so a timeout must not be recorded as one.
              expect(spans.find(span => span.name === 'generate_content caller-abort')!.status).toBe('ok');
              expect(spans.find(span => span.name === 'generate_content timeout')!.status).toBe('error');
              expect(spans.find(span => span.name === 'generate_content caller-abort-before-stream')!.status).toBe(
                'ok',
              );
              expect(spans.find(span => span.name === 'generate_content timeout-before-stream')!.status).toBe('error');
            },
          })
          .start()
          .completed();
      });
    },
  );
});

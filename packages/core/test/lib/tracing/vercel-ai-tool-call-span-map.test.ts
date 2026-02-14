import { beforeEach, describe, expect, it } from 'vitest';
import { addVercelAiProcessors } from '../../../src/tracing/vercel-ai';
import { toolCallSpanMap } from '../../../src/tracing/vercel-ai/constants';
import { _INTERNAL_cleanupToolCallSpan, _INTERNAL_getSpanForToolCallId } from '../../../src/tracing/vercel-ai/utils';
import {
  AI_TOOL_CALL_ID_ATTRIBUTE,
  AI_TOOL_CALL_NAME_ATTRIBUTE,
} from '../../../src/tracing/vercel-ai/vercel-ai-attributes';
import type { SpanAttributes, SpanAttributeValue, SpanTimeInput } from '../../../src/types-hoist/span';
import type { SpanStatus } from '../../../src/types-hoist/spanStatus';
import type { OpenTelemetrySdkTraceBaseSpan } from '../../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

function createToolCallSpan(params: {
  toolCallId: string;
  toolName: string;
  traceId: string;
  spanId: string;
}): OpenTelemetrySdkTraceBaseSpan {
  const attributes: SpanAttributes = {
    [AI_TOOL_CALL_ID_ATTRIBUTE]: params.toolCallId,
    [AI_TOOL_CALL_NAME_ATTRIBUTE]: params.toolName,
  };

  const startTime: SpanTimeInput = [0, 0];
  const endTime: SpanTimeInput = [0, 0];
  const status: SpanStatus = { code: 0 };

  const span: OpenTelemetrySdkTraceBaseSpan = {
    attributes,
    startTime,
    endTime,
    name: 'ai.toolCall',
    status,
    spanContext: () => ({
      traceId: params.traceId,
      spanId: params.spanId,
      traceFlags: 1,
    }),
    end: () => undefined,
    setAttribute: (key: string, value: SpanAttributeValue | undefined) => {
      if (value === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete attributes[key];
      } else {
        attributes[key] = value;
      }
      return span;
    },
    setAttributes: (nextAttributes: SpanAttributes) => {
      for (const key of Object.keys(nextAttributes)) {
        const value = nextAttributes[key];
        if (value === undefined) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete attributes[key];
        } else {
          attributes[key] = value;
        }
      }
      return span;
    },
    setStatus: (nextStatus: SpanStatus) => {
      span.status = nextStatus;
      return span;
    },
    updateName: (name: string) => {
      span.name = name;
      return span;
    },
    isRecording: () => true,
    addEvent: () => span,
    addLink: () => span,
    addLinks: () => span,
    recordException: () => undefined,
  };

  return span;
}

describe('vercel-ai tool call span context map', () => {
  beforeEach(() => {
    toolCallSpanMap.clear();
  });

  it('stores toolCallId -> span context on spanStart', () => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0 });
    const client = new TestClient(options);
    client.init();
    addVercelAiProcessors(client);

    const span = createToolCallSpan({
      toolCallId: 'tool-call-1',
      toolName: 'bash',
      traceId: 'trace-id-1',
      spanId: 'span-id-1',
    });

    client.emit('spanStart', span);

    expect(_INTERNAL_getSpanForToolCallId('tool-call-1')).toMatchObject({
      traceId: 'trace-id-1',
      spanId: 'span-id-1',
    });

    _INTERNAL_cleanupToolCallSpan('tool-call-1');
    expect(_INTERNAL_getSpanForToolCallId('tool-call-1')).toBeUndefined();
  });
});

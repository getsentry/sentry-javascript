type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

function toBlocks(content: string | AnthropicContentBlock[]): AnthropicContentBlock[] {
  return typeof content === 'string' ? [{ type: 'text', text: content }] : content;
}

function isTextDeltas(content: string | string[] | AnthropicContentBlock[]): content is string[] {
  return Array.isArray(content) && content.every(entry => typeof entry === 'string');
}

function defaultStopReason(blocks: AnthropicContentBlock[]): string {
  return blocks.some(block => block.type === 'tool_use') ? 'tool_use' : 'end_turn';
}

/** A non-streamed Anthropic `/v1/messages` response. A string `content` becomes one text block. */
export function anthropicMessage(
  model: string,
  {
    id = 'msg_mock123',
    content = 'Hello from Anthropic mock!',
    stopReason,
    usage = { input_tokens: 10, output_tokens: 15 },
  }: { id?: string; content?: string | AnthropicContentBlock[]; stopReason?: string; usage?: AnthropicUsage } = {},
): Record<string, unknown> {
  const blocks = toBlocks(content);
  return {
    id,
    type: 'message',
    role: 'assistant',
    model,
    content: blocks,
    stop_reason: stopReason ?? defaultStopReason(blocks),
    stop_sequence: null,
    usage,
  };
}

/**
 * The server-sent events of a streamed Anthropic message, from `message_start` to `message_stop`.
 *
 * A string `content` streams as one text block; a string array streams one text block, one delta per
 * entry. A tool_use block streams its input as one `input_json_delta`.
 */
export function anthropicMessageStream(
  model: string,
  {
    id = 'msg_stream_1',
    content = 'Hello!',
    stopReason,
    usage = { input_tokens: 10, output_tokens: 15 },
  }: {
    id?: string;
    content?: string | string[] | AnthropicContentBlock[];
    stopReason?: string;
    usage?: AnthropicUsage;
  } = {},
): Record<string, unknown>[] {
  const blocks: AnthropicContentBlock[] = isTextDeltas(content)
    ? [{ type: 'text', text: content.join('') }]
    : toBlocks(content);

  const events: Record<string, unknown>[] = [
    {
      type: 'message_start',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        usage: { input_tokens: usage.input_tokens },
      },
    },
  ];

  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      const deltas = isTextDeltas(content) ? content : [block.text];
      events.push(
        { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
        ...deltas.map(text => ({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } })),
      );
    } else {
      events.push(
        { type: 'content_block_start', index, content_block: { ...block, input: {} } },
        {
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) },
        },
      );
    }
    events.push({ type: 'content_block_stop', index });
  });

  events.push(
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason ?? defaultStopReason(blocks), stop_sequence: null },
      usage: { output_tokens: usage.output_tokens },
    },
    { type: 'message_stop' },
  );
  return events;
}
